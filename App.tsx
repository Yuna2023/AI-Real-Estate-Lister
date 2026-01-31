
import React, { useState, useEffect } from 'react';
import { PropertyListing, AppStatus } from './types';
import { scrapeProperty } from './services/apiService';
import PropertyCard from './components/PropertyCard';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './services/firebase';

const App: React.FC = () => {
  // 1. 預設只顯示一個 input 欄位
  const [urlInputs, setUrlInputs] = useState<string[]>(['']);
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});

  // 6. 預覽房源資料
  const previewListing: PropertyListing = {
    id: 'preview-id',
    displayId: 'REF-SAMPLE',
    createdAt: '2024-05-20',
    url: '#',
    daysOnMarket: '15',
    yearBuilt: '2022',
    price: '$850,000',
    beds: '3',
    baths: '2',
    sqft: '1,800',
    sqftLot: '4,500',
    address: '範例展示：台北市信義區忠孝東路',
    armls: '88866622',
    description: '此為預覽卡片，展示系統抓取後的呈現樣式。包含多圖藝廊、完整房源參數與自動產生的編號日期。',
    images: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1600607687940-4e524cb35a3a?auto=format&fit=crop&q=80&w=800'
    ],
    region: 'Phoenix',
    priceStatus: '降價中',
    listingStatus: '上市中',
    lastUpdated: Date.now()
  };

  useEffect(() => {
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

  const handleScrape = async () => {
    const validUrls = urlInputs.map(u => u.trim()).filter(u => u.length > 0);
    if (validUrls.length === 0) return;

    setStatus(AppStatus.LOADING);
    setError(null);
    setProcessedCount(0);
    setFieldErrors({});

    try {
      const total = validUrls.length;
      let completed = 0;

      await Promise.all(
        urlInputs.map(async (url, index) => {
          if (!url.trim()) return;
          try {
            await scrapeProperty(url);
          } catch (err: any) {
            setFieldErrors(prev => ({ ...prev, [index]: err.message || "抓取失敗" }));
          } finally {
            completed++;
            setProcessedCount(completed);
          }
        })
      );

      // 如果有任何欄位失敗，不自動清空欄位，讓使用者可以看到錯誤
      const hasErrors = Object.keys(fieldErrors).length > 0;
      if (!hasErrors) {
        setUrlInputs(['']);
        setStatus(AppStatus.SUCCESS);
      } else {
        setStatus(AppStatus.ERROR);
      }

      setTimeout(() => setStatus(AppStatus.IDLE), 3000);
    } catch (err: any) {
      setError(err.message || "處理過程中發生錯誤");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === 'preview-id') return; // 不允許刪除預覽
    if (window.confirm("確定要刪除此房源嗎？")) {
      await deleteDoc(doc(db, 'listings', id));
    }
  };

  const handleUpdate = async (id: string, data: Partial<PropertyListing>) => {
    if (id === 'preview-id') return;
    await updateDoc(doc(db, 'listings', id), {
      ...data,
      lastUpdated: Date.now()
    });
  };

  const addInputField = () => setUrlInputs([...urlInputs, '']);

  // 5. 移除 input 欄位邏輯
  const removeInputField = (index: number) => {
    if (urlInputs.length <= 1) {
      // 永遠保持最少一個輸入欄位
      setUrlInputs(['']);
      return;
    }
    const next = [...urlInputs];
    next.splice(index, 1);
    setUrlInputs(next);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-20">
      <header className="px-8 h-16 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-white text-[10px] font-black">AI</span>
          房源中台管理系統
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
            {listings.length} 個房源
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-12">
        <section className="bg-white p-10 rounded-2xl border border-slate-100 mb-12 max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">導入房源網址</h2>
              <p className="text-sm text-slate-400">貼上網址，系統將透過 Firecrawl 自動完成資訊分析</p>
            </div>
            {/* 2. 新增欄位按鈕：白底藍紫色外框 */}
            {/* 2. 新增欄位按鈕：達到 4 筆時變灰 */}
            <button
              onClick={addInputField}
              disabled={urlInputs.length >= 4}
              className={`px-4 py-2 border rounded-lg text-sm font-bold transition-colors ${urlInputs.length >= 4
                  ? 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                  : 'border-indigo-600 text-indigo-600 bg-white hover:bg-indigo-50'
                }`}
            >
              {urlInputs.length >= 4 ? '已達上限' : '+ 新增欄位'}
            </button>
          </div>

          <div className="space-y-4">
            {urlInputs.map((url, i) => {
              // 正規化比較網址 (去斜槓 + 小寫)
              const normalizedUrl = url.trim().replace(/\/$/, "").toLowerCase();
              const isDuplicate = url.trim() !== '' &&
                status !== AppStatus.LOADING && // 正在抓取時不顯示警示，避免新存入的資料誤報
                listings.some(l => l.url === normalizedUrl);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <input
                      value={url}
                      onChange={(e) => {
                        const next = [...urlInputs];
                        next[i] = e.target.value;
                        setUrlInputs(next);
                      }}
                      placeholder="請貼上房源網址 (例如 Zillow, Redfin...)"
                      className={`flex-1 px-4 py-3 bg-[#FCFCFC] border ${isDuplicate ? 'border-red-200 focus:border-red-400' : 'border-slate-100 focus:border-indigo-500'} rounded-lg text-sm focus:bg-white transition-all outline-none`}
                    />
                    {/* 4. 垃圾桶 icon */}
                    <button
                      onClick={() => removeInputField(i)}
                      className="p-3 text-slate-400 hover:text-red-500 transition-colors"
                      title="移除欄位"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {fieldErrors[i] ? (
                    <p className="text-[11px] text-red-500 font-medium ml-1">
                      ❌ {fieldErrors[i]}
                    </p>
                  ) : isDuplicate && (
                    <p className="text-[11px] text-amber-600 font-bold ml-1 animate-pulse">
                      ⚠️ 這筆房源網址已經存在，是否確定要抓取資料？
                    </p>
                  )}
                </div>
              );
            })}

            {/* 3. 取得房源資料按鈕：藍紫色底無外框 */}
            <button
              onClick={handleScrape}
              disabled={status === AppStatus.LOADING || urlInputs.every(u => !u.trim())}
              className="w-full mt-6 py-4 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:bg-slate-300 transition-all flex items-center justify-center gap-2 border-none"
            >
              {status === AppStatus.LOADING
                ? `正在抓取第 ${processedCount + 1} 筆房源資料...`
                : '取得房源資料'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded text-red-600 text-xs font-medium">
              ⚠️ {error}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* 6. 房源卡片預覽區 */}
          <div className="relative">
            <div className="absolute -top-3 left-4 z-10 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded">PREVIEW 預覽</div>
            <PropertyCard
              listing={previewListing}
              onDelete={() => { }}
              onUpdate={() => { }}
            />
          </div>

          {listings.map(listing => (
            <PropertyCard
              key={listing.id}
              listing={listing}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}

          {listings.length === 0 && status !== AppStatus.LOADING && (
            <div className="hidden md:flex flex-col items-center justify-center py-24 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="text-3xl mb-4 grayscale opacity-30">🏠</div>
              <h3 className="text-sm font-bold text-slate-400">等待導入房源</h3>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
