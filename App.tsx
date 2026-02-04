
import React, { useState, useEffect } from 'react';
import { PropertyListing, AppStatus } from './types';
import PropertyCard from './components/PropertyCard';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './services/firebase';


const App: React.FC = () => {
  const [urlInputs, setUrlInputs] = useState<string[]>(['']);
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [waitingMessage, setWaitingMessage] = useState<string>('');

  // Duplicate Handling
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [pendingScrapeUrls, setPendingScrapeUrls] = useState<string[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<{ url: string, id: string, displayId: string }[]>([]);

  // Search Filters State
  const [filters, setFilters] = useState({
    keyword: '',
    maxTsmcDist: 30, // Default max range
    maxCostcoDist: 15,
    showPriceDropOnly: false,
    showGoodSchoolOnly: false,
    showNoRoadFrontage: false, // true means ONLY show no road frontage (road_frontage === false)
    showSouthFacing: false,
    listingStatus: 'all', // all, pre_listed, listed, sold
    listingType: 'all'    // all, for_sale, for_rent
  });

  useEffect(() => {
    // 監聽並取得所有房源，在前端進行篩選 (適用於內部管理系統規模)
    const q = query(collection(db, 'listings'), orderBy('lastUpdated', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PropertyListing[];
      setListings(data);
    });
    return () => unsubscribe();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Optional: Add toast notification here
  };

  const handleScrapeRequest = () => {
    const validUrls = urlInputs.map(u => u.trim()).filter(u => u.length > 0);
    if (validUrls.length === 0) return;

    // Check for duplicates locally first
    const duplicates: { url: string, id: string, displayId: string }[] = [];
    validUrls.forEach(url => {
      // Normalize URL for comparison (remove trailing slash, lowercase)
      const normUrl = url.toLowerCase().replace(/\/$/, "");
      const found = listings.find(l => l.url.toLowerCase().replace(/\/$/, "") === normUrl);
      if (found) {
        duplicates.push({ url, id: found.id, displayId: found.displayId });
      }
    });

    if (duplicates.length > 0) {
      setDuplicateWarnings(duplicates);
      setPendingScrapeUrls(validUrls);
      setShowDuplicateConfirm(true);
    } else {
      executeScrape(validUrls);
    }
  };

  const executeScrape = async (urlsToScrape: string[]) => {
    setStatus(AppStatus.LOADING);
    setError(null);
    setProcessedCount(0);
    setFieldErrors({});
    setWaitingMessage('正在進行批次抓取與解析...');
    setShowDuplicateConfirm(false);

    let statusUnsubscribe: (() => void) | null = null;

    try {
      const apiScrapeBatch = httpsCallable(functions, 'apiScrapeBatch');

      // 開始呼叫 API（不等待完成）
      const resultPromise = apiScrapeBatch({ urls: urlsToScrape });

      // 監聽 batch_status 集合的最新文件
      const batchStatusQuery = query(
        collection(db, 'batch_status'),
        orderBy('startedAt', 'desc')
      );

      statusUnsubscribe = onSnapshot(batchStatusQuery, (snapshot) => {
        if (snapshot.docs.length > 0) {
          const latestBatch = snapshot.docs[0].data();
          // 更新等待訊息為當前狀態
          if (latestBatch.currentStatus) {
            setWaitingMessage(latestBatch.currentStatus);
          }
          // 更新進度計數
          if (latestBatch.completed !== undefined) {
            setProcessedCount(latestBatch.completed);
          }
        }
      });

      // 等待 API 完成
      const result: any = await resultPromise;
      const { details } = result.data;

      // 停止監聽
      if (statusUnsubscribe) statusUnsubscribe();

      const newFieldErrors: Record<number, string> = {};
      const successfulUrls: string[] = [];

      // 處理每個 URL 的結果
      details.forEach((item: any) => {
        if (item.success) {
          successfulUrls.push(item.url.toLowerCase().replace(/\/$/, ""));
        } else {
          // 找回原始 index
          const originalIndex = urlInputs.findIndex(u => u.trim() === item.url);
          if (originalIndex !== -1) {
            newFieldErrors[originalIndex] = item.error || "抓取失敗";
          }
        }
      });

      setProcessedCount(urlsToScrape.length);
      setFieldErrors(newFieldErrors);

      // Robust clearing logic: Keep only URLs that were NOT successful
      const remainingUrls = urlInputs.filter(u => {
        const norm = u.trim().toLowerCase().replace(/\/$/, "");
        return norm !== "" && !successfulUrls.includes(norm);
      });

      if (remainingUrls.length === 0) {
        // All done, clear everything
        setUrlInputs(['']);
        setStatus(AppStatus.SUCCESS);
      } else {
        // Some failed, keep them
        setUrlInputs(remainingUrls);
        setStatus(AppStatus.ERROR);
      }

      setTimeout(() => setStatus(AppStatus.IDLE), 3000);

    } catch (err: any) {
      if (statusUnsubscribe) statusUnsubscribe();
      setError(err.message || "批次處理發生錯誤");
      setStatus(AppStatus.ERROR);
    } finally {
      setWaitingMessage('');
    }
  };

  const handleScrape = async () => {
    // Deprecated, redirected to handleScrapeRequest
    handleScrapeRequest();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'listings', id));
  };

  const handleUpdate = async (id: string, data: Partial<PropertyListing>) => {
    await updateDoc(doc(db, 'listings', id), {
      ...data,
      lastUpdated: Date.now()
    });
  };

  const addInputField = () => setUrlInputs([...urlInputs, '']);
  const removeInputField = (index: number) => {
    if (urlInputs.length <= 1) {
      setUrlInputs(['']);
      return;
    }
    const next = [...urlInputs];
    next.splice(index, 1);
    setUrlInputs(next);
  };

  // Filtering Logic
  const filteredListings = listings.filter(l => {
    // Keyword Search
    if (filters.keyword) {
      const k = filters.keyword.toLowerCase();
      const content = [
        l.address,
        l.region,
        l.displayId,
        ...(l.tags || [])
      ].join(' ').toLowerCase();
      if (!content.includes(k)) return false;
    }

    // Filters
    // Distance filters removed as per user request (Show ALL regardless of distance)
    // if (l.tsmc_distance_miles && l.tsmc_distance_miles > filters.maxTsmcDist) return false;
    // if (l.costco_distance_miles != null && l.costco_distance_miles > filters.maxCostcoDist) return false;

    if (filters.showPriceDropOnly && !l.price_drop) return false;
    if (filters.showGoodSchoolOnly && l.school_district !== '優秀學區') return false;
    if (filters.showNoRoadFrontage && l.road_frontage === true) return false; // road_frontage=true means Issue
    if (filters.showSouthFacing && l.orientation !== true) return false;

    if (filters.listingStatus !== 'all' && l.listing_status !== filters.listingStatus) return false;
    if (filters.listingType !== 'all' && l.listing_type !== filters.listingType) return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-20 font-sans text-slate-900">
      {/* Search Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="bg-indigo-600 text-white px-2 py-1 rounded text-sm font-black">AZ</span>
              房源中台系統
            </h1>
            <div className="text-sm text-slate-500">
              顯示 {filteredListings.length} / {listings.length} 筆
            </div>
          </div>

          {/* Search Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
            {/* 1. Keyword */}
            <div className="col-span-1 md:col-span-4">
              <input
                type="text"
                placeholder="🔍 搜尋關鍵字 (地區、標籤、ID...)"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={filters.keyword}
                onChange={e => setFilters(p => ({ ...p, keyword: e.target.value }))}
              />
            </div>

            {/* 2. Sliders */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 block flex justify-between">
                TSMC 距離 (英里) <span className="text-indigo-600">{filters.maxTsmcDist} mi</span>
              </label>
              <input
                type="range" min="0" max="50" step="1"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                value={filters.maxTsmcDist}
                onChange={e => setFilters(p => ({ ...p, maxTsmcDist: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 block flex justify-between">
                Costco 距離 (英里) <span className="text-indigo-600">{filters.maxCostcoDist} mi</span>
              </label>
              <input
                type="range" min="0" max="30" step="1"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                value={filters.maxCostcoDist}
                onChange={e => setFilters(p => ({ ...p, maxCostcoDist: parseInt(e.target.value) }))}
              />
            </div>

            {/* 3. Checkboxes */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-600" checked={filters.showPriceDropOnly} onChange={e => setFilters(p => ({ ...p, showPriceDropOnly: e.target.checked }))} />
                📉 降價
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-600" checked={filters.showGoodSchoolOnly} onChange={e => setFilters(p => ({ ...p, showGoodSchoolOnly: e.target.checked }))} />
                🎓 優秀學區
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-600" checked={filters.showNoRoadFrontage} onChange={e => setFilters(p => ({ ...p, showNoRoadFrontage: e.target.checked }))} />
                🛣️ 無路衝
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-600" checked={filters.showSouthFacing} onChange={e => setFilters(p => ({ ...p, showSouthFacing: e.target.checked }))} />
                🧭 坐北朝南
              </label>
            </div>

            {/* 4. Dropdowns + Clear */}
            <div className="flex gap-2">
              <select
                className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                value={filters.listingStatus}
                onChange={e => setFilters(p => ({ ...p, listingStatus: e.target.value }))}
              >
                <option value="all">所有狀態</option>
                <option value="pre_listed">搶先看 (Pre)</option>
                <option value="listed">已上市 (Active)</option>
                <option value="sold">已售出 (Sold)</option>
              </select>
              <button
                onClick={() => setFilters({
                  keyword: '',
                  maxTsmcDist: 30,
                  maxCostcoDist: 15,
                  showPriceDropOnly: false,
                  showGoodSchoolOnly: false,
                  showNoRoadFrontage: false,
                  showSouthFacing: false,
                  listingStatus: 'all',
                  listingType: 'all'
                })}
                className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded hover:bg-slate-300 transition-colors"
              >
                清除
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Scrape Input Section (Collapsible or Standard) */}
        <section className="bg-white p-6 rounded-2xl border border-slate-100 mb-8 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-800">＋ 新增房源</h2>
            <button
              onClick={addInputField}
              disabled={urlInputs.length >= 4}
              className={`text-sm font-bold px-3 py-1.5 rounded-lg border transition-colors ${urlInputs.length >= 4
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white text-indigo-600 border-indigo-500 hover:bg-indigo-50'
                }`}
            >
              + 增加網址
            </button>
          </div>
          <div className="space-y-3">
            {urlInputs.map((url, i) => {
              // Check for duplicate URLs
              const isDuplicate = urlInputs.filter((u, idx) =>
                u.trim().toLowerCase() === url.trim().toLowerCase() &&
                u.trim() !== '' &&
                idx !== i
              ).length > 0;

              // Check existing listing duplicate
              const normUrl = url.trim().toLowerCase().replace(/\/$/, "");
              const existingListing = url.trim() ? listings.find(l => l.url.toLowerCase().replace(/\/$/, "") === normUrl) : null;

              return (
                <div key={i}>
                  <div className="flex gap-2 items-center">
                    <input
                      value={url}
                      onChange={e => {
                        const next = [...urlInputs];
                        next[i] = e.target.value;
                        setUrlInputs(next);
                      }}
                      placeholder="輸入 Zillow/Redfin 網址..."
                      className={`flex-1 px-4 py-2 bg-slate-50 border rounded focus:border-indigo-500 outline-none text-sm ${isDuplicate ? 'border-red-400 bg-red-50' : 'border-slate-200'
                        }`}
                    />
                    <button
                      onClick={() => removeInputField(i)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title={urlInputs.length === 1 ? '清空內容' : '刪除欄位'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {isDuplicate && (
                    <p className="text-red-500 text-xs mt-1 ml-1">⚠️ 此網址已重複輸入</p>
                  )}
                  {existingListing && (
                    <div className="flex items-center gap-2 mt-1 ml-1 text-xs bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-200">
                      <span>⚠️ 此房源已存在 (ID: {existingListing.displayId})</span>
                      <button
                        onClick={() => copyToClipboard(existingListing.displayId)}
                        className="px-2 py-0.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded border border-yellow-300 transition-colors"
                      >
                        複製編號
                      </button>
                    </div>
                  )}
                  {fieldErrors[i] && (
                    <p className="text-red-500 text-xs mt-1 ml-1">❌ {fieldErrors[i]}</p>
                  )}
                </div>
              );
            })}
            {status === AppStatus.ERROR && error && <div className="text-red-500 text-sm">{error}</div>}
            <button
              onClick={handleScrape}
              disabled={status === AppStatus.LOADING}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === AppStatus.LOADING
                ? waitingMessage || `正在抓取第 ${processedCount + 1} 筆 / 共 ${urlInputs.filter(u => u.trim()).length} 筆房源...`
                : '開始分析'}
            </button>
          </div>
        </section>

        {/* Listings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {filteredListings.map(listing => (
            <PropertyCard
              key={listing.id}
              listing={listing}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
          {filteredListings.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-400">
              沒有符合搜尋條件的房源
            </div>
          )}
        </div>
      </main>

      {/* Duplicate Confirmation Modal */}
      {showDuplicateConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]" onClick={() => setShowDuplicateConfirm(false)}>
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full mx-4 relative" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">⚠️ 發現重複房源</h3>
            <p className="text-sm text-slate-600 mb-4">
              您輸入的網址中有 <span className="font-bold text-indigo-600">{duplicateWarnings.length}</span> 筆已經存在於資料庫中。
              <br /><br />
              若選擇繼續，系統將只更新該房源的 <span className="font-bold">價格</span> 與 <span className="font-bold">上市狀態</span>，其他資料將維持不變。
            </p>
            <div className="bg-slate-50 p-3 rounded border border-slate-100 mb-4 max-h-32 overflow-y-auto">
              {duplicateWarnings.map((d, i) => (
                <div key={i} className="text-xs text-slate-500 mb-1 last:mb-0 break-all">
                  • {d.url} (ID: {d.displayId})
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => executeScrape(pendingScrapeUrls)}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
              >
                確定更新
              </button>
              <button
                onClick={() => setShowDuplicateConfirm(false)}
                className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
