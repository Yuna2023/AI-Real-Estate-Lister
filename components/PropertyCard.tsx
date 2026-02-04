
import React, { useState, useEffect } from 'react';
import { PropertyListing, EditStatus, ListingStatus, ListingType } from '../types';
import LineCardPreview from './LineCardPreview';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

interface PropertyCardProps {
  listing: PropertyListing;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<PropertyListing>) => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ listing, onDelete, onUpdate }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewingLine, setIsPreviewingLine] = useState(false);
  const [editData, setEditData] = useState<PropertyListing>({ ...listing });
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Sync editData when listing updates (important for Phase 2 updates)
  useEffect(() => {
    setEditData({ ...listing });
  }, [listing]);

  const handleCalculateDistance = async () => {
    if (!listing.address) return;
    setIsCalculatingDistance(true);
    try {
      const apiCalculateDistances = httpsCallable(functions, 'apiCalculateDistances');
      await apiCalculateDistances({ listingId: listing.id, address: listing.address });
    } catch (err) {
      console.error('Distance calculation failed:', err);
      alert('距離計算失敗，請稍後再試');
    } finally {
      setIsCalculatingDistance(false);
    }
  };

  const handleTranslate = async () => {
    if (!editData.description) return;
    setIsTranslating(true);
    try {
      const apiTranslateDescription = httpsCallable(functions, 'apiTranslateDescription');
      const result: any = await apiTranslateDescription({ listingId: listing.id, text: editData.description });
      if (result.data.translatedText) {
        setEditData({ ...editData, descriptionZh: result.data.translatedText });
      }
    } catch (err) {
      console.error('Translation failed:', err);
      alert('翻譯失敗，請稍後再試');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = () => {
    const updatedData = {
      ...editData,
      edit_status: 'boss_edited' as EditStatus
    };
    onUpdate(listing.id, updatedData);
    setIsEditing(false);
  };

  const handleApprove = () => {
    onUpdate(listing.id, {
      edit_status: 'my_reviewed',
      listing_status: 'listed'
    });
  };

  const togglePriceDrop = () => {
    onUpdate(listing.id, { price_drop: !listing.price_drop });
  };

  const markSold = () => {
    if (window.confirm("確定標記為已售出 (Sold)？")) {
      onUpdate(listing.id, { listing_status: 'sold' });
    }
  };

  // Status Badge Helper
  const getStatusBadge = () => {
    switch (listing.listing_status) {
      case 'pre_listed': return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-200">✨ 搶先看</span>;
      case 'listed': return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200">🟢 已上市</span>;
      case 'sold': return <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">⚫️ 已售出</span>;
      default: return <span className="bg-slate-50 text-slate-500 px-2 py-0.5 rounded text-[10px] border border-slate-200">{listing.listing_status}</span>;
    }
  };

  // Price Status Badge
  const getPriceStatusBadge = () => {
    if (listing.priceStatus === 'price_drop') {
      return <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">🔻 降價 {listing.priceDropAmount || ''}</span>;
    }
    if (listing.priceStatus === 'pending') {
      return <span className="bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded text-[10px] font-bold">⏳ Pending</span>;
    }
    if (listing.priceStatus === 'sold') {
      return <span className="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">🏠 已售出</span>;
    }
    return null;
  };

  // Is pending detail (Phase 2 loading)
  const isPendingDetail = listing.edit_status === 'pending_detail';

  // Render distance display (single button approach)
  const renderDistanceSection = () => {
    if (listing.distanceCalculated) {
      return (
        <div className="grid grid-cols-2 gap-2 bg-gradient-to-br from-indigo-50 to-slate-50 p-2 rounded-lg border border-indigo-100">
          <div className="space-y-0.5">
            <span className="text-[10px] text-indigo-500 font-bold block">🏭 TSMC</span>
            <span className={`text-sm font-bold ${listing.tsmc_duration_minutes && listing.tsmc_duration_minutes < 30 ? 'text-green-600' : 'text-slate-700'}`}>
              {listing.tsmc_duration_minutes || '-'} 分鐘
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-indigo-500 font-bold block">🛒 Costco</span>
            <span className={`text-sm font-bold ${listing.costco_duration_minutes && listing.costco_duration_minutes < 15 ? 'text-green-600' : 'text-slate-700'}`}>
              {listing.costco_duration_minutes || '-'} 分鐘
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-indigo-500 font-bold block">💻 Intel</span>
            <span className="text-sm font-bold text-slate-700">{listing.intel_duration_minutes || '-'} 分鐘</span>
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] text-indigo-500 font-bold block">✈️ PHX機場</span>
            <span className="text-sm font-bold text-slate-700">{listing.airport_duration_minutes || '-'} 分鐘</span>
          </div>
        </div>
      );
    }

    // Single button to calculate all distances
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-3 rounded-lg border border-indigo-100 text-center">
        <button
          onClick={handleCalculateDistance}
          disabled={isCalculatingDistance || !listing.address}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isCalculatingDistance ? '⏳ 計算中...' : '🗺️ 計算交通距離'}
        </button>
        <p className="text-[10px] text-slate-400 mt-1">TSMC / Costco / Intel / PHX機場</p>
      </div>
    );
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border-2 border-indigo-500 p-6 space-y-4 shadow-xl z-20 relative">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-900">✏️ 編輯房源資料</h3>
          <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-3 h-[450px] overflow-y-auto pr-2 custom-scrollbar">
          {/* Status & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500">上市狀態</label>
              <select
                className="w-full p-2 bg-slate-50 border rounded text-sm"
                value={editData.listing_status || 'pre_listed'}
                onChange={e => setEditData({ ...editData, listing_status: e.target.value as ListingStatus })}
              >
                <option value="pre_listed">搶先看</option>
                <option value="listed">已上市</option>
                <option value="sold">已售出</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500">類型</label>
              <select
                className="w-full p-2 bg-slate-50 border rounded text-sm"
                value={editData.listing_type || 'for_sale'}
                onChange={e => setEditData({ ...editData, listing_type: e.target.value as ListingType })}
              >
                <option value="for_sale">販售</option>
                <option value="for_rent">出租</option>
              </select>
            </div>
          </div>

          {/* Price & Address */}
          <div>
            <label className="text-xs font-bold text-slate-500">價格</label>
            <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.price || ''} onChange={e => setEditData({ ...editData, price: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">地址</label>
            <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.address || ''} onChange={e => setEditData({ ...editData, address: e.target.value })} />
          </div>

          {/* Distance display in edit mode */}
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 space-y-2">
            <div className="text-xs font-bold text-indigo-800">駕駛時間 (分鐘)</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>🏭 TSMC: <span className="font-bold">{editData.tsmc_duration_minutes || '-'}</span></div>
              <div>💻 Intel: <span className="font-bold">{editData.intel_duration_minutes || '-'}</span></div>
              <div>🛒 Costco: <span className="font-bold">{editData.costco_duration_minutes || '-'}</span></div>
              <div>✈️ 機場: <span className="font-bold">{editData.airport_duration_minutes || '-'}</span></div>
            </div>
            {!editData.distanceCalculated && (
              <button onClick={handleCalculateDistance} disabled={isCalculatingDistance} className="w-full mt-2 py-1 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
                {isCalculatingDistance ? '計算中...' : '🗺️ 計算距離'}
              </button>
            )}
          </div>

          {/* Flags */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer bg-slate-50 p-2 rounded border">
              <input type="checkbox" checked={editData.price_drop || false} onChange={e => setEditData({ ...editData, price_drop: e.target.checked })} />
              📉 降價
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer bg-slate-50 p-2 rounded border">
              <input type="checkbox" checked={editData.road_frontage || false} onChange={e => setEditData({ ...editData, road_frontage: e.target.checked })} />
              🛣️ 路衝
            </label>
          </div>

          {/* 英文描述 */}
          <div>
            <label className="text-xs font-bold text-slate-500">房源描述（英文）</label>
            <textarea
              className="w-full p-2 bg-slate-50 border rounded text-sm h-24"
              value={editData.description || ''}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              placeholder="英文描述..."
            />
          </div>

          {/* 翻譯按鈕 + 中文描述 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-500">房源描述（中文）</label>
              <button
                onClick={handleTranslate}
                disabled={isTranslating || !editData.description}
                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {isTranslating ? '翻譯中...' : '🔄 翻譯成中文'}
              </button>
            </div>
            <textarea
              className="w-full p-2 bg-slate-50 border rounded text-sm h-24"
              value={editData.descriptionZh || ''}
              onChange={(e) => setEditData({ ...editData, descriptionZh: e.target.value })}
              placeholder="點擊翻譯按鈕或手動輸入..."
            />
          </div>
        </div>

        <div className="pt-2 border-t flex gap-3">
          <button onClick={handleSave} className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700">儲存變更</button>
        </div>
      </div>
    );
  }

  // Border color based on status
  const borderColor = isPendingDetail ? 'border-dashed border-blue-300 animate-pulse' :
    listing.edit_status === 'draft' ? 'border-dashed border-amber-300' :
      'border-slate-200';

  return (
    <div className={`bg-white rounded-xl border ${borderColor} overflow-hidden flex flex-col h-full hover:shadow-xl transition-all duration-300 relative group`}>
      {/* 圖片展示區 */}
      <div className="relative">
        <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
          {listing.images && listing.images.length > 0 ? (
            <img src={listing.images[currentImageIndex]} alt="Property" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">No Image</div>
          )}

          {/* Top Left Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {getStatusBadge()}
            {getPriceStatusBadge()}
            {listing.price_drop && listing.priceStatus !== 'price_drop' && <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">📉 降價</span>}
          </div>

          {/* Loading Indicator for pending_detail */}
          {isPendingDetail && (
            <div className="absolute bottom-2 right-2 bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md flex items-center gap-1">
              <span className="animate-spin">⏳</span> 載入詳細資料...
            </div>
          )}

          {/* Draft Indicator */}
          {listing.edit_status === 'draft' && !isPendingDetail && (
            <div className="absolute bottom-2 right-2 bg-amber-400 text-white text-[10px] font-black px-2 py-1 rounded shadow-md">
              DRAFT
            </div>
          )}
        </div>

        {/* Delete Button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(listing.id); }}
          className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-red-600 transition-colors z-10"
          title="刪除"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        {/* Thumbnail Scroll */}
        {listing.images && listing.images.length > 1 && (
          <div className="flex gap-1 overflow-x-auto p-1 bg-white border-b no-scrollbar">
            {listing.images.map((img, idx) => (
              <button
                key={idx}
                onMouseEnter={() => setCurrentImageIndex(idx)}
                className={`flex-shrink-0 w-10 h-8 rounded-sm overflow-hidden border ${currentImageIndex === idx ? 'border-indigo-600 opacity-100' : 'border-transparent opacity-50'}`}
              >
                <img src={img} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 資訊展示區 */}
      <div className="p-4 flex-1 flex flex-col space-y-3">
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {listing.region && (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${listing.region === 'Peoria' ? 'bg-green-100 text-green-700' :
              listing.region === 'Phoenix' ? 'bg-pink-100 text-pink-700' :
                listing.region === 'Glendale' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-700'
              }`}>
              📍 {listing.region}
            </span>
          )}
        </div>

        {/* Price & Address */}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-indigo-700 leading-none">{listing.price || '未定價'}</div>
            {listing.originalPrice && listing.priceStatus === 'price_drop' && (
              <div className="text-xs text-slate-400 line-through">{listing.originalPrice}</div>
            )}
            <a href={listing.url} target="_blank" className="text-xs text-slate-500 hover:text-indigo-600 mt-1 underline block break-words">
              {listing.address || '無地址'}
            </a>
          </div>
          <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
            <div className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1 rounded">{listing.displayId}</div>
            {listing.armls && <div className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1 rounded">ARMLS: {listing.armls}</div>}
            <div className="text-[9px] text-slate-400">📅 {listing.createdAt}</div>
          </div>
        </div>

        {/* Distance Section (single button or grid) */}
        {renderDistanceSection()}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
          <div>
            <span className="text-slate-400 block text-[10px]">房型</span>
            <span className="font-semibold">{listing.beds || '-'}房 / {listing.baths || '-'}衛</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">建年</span>
            <span className="font-semibold">{isPendingDetail ? '...' : (listing.yearBuilt || '-')}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">室內</span>
            <span className="font-semibold">
              {listing.sqft || '-'} sqft
              {listing.sqftPing && <span className="text-indigo-600 ml-1">({listing.sqftPing}坪)</span>}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">建地</span>
            <span className="font-semibold">
              {isPendingDetail ? '...' : (listing.sqftLot || '-')} sqft
              {listing.sqftLotPing && <span className="text-indigo-600 ml-1">({listing.sqftLotPing}坪)</span>}
            </span>
          </div>
        </div>

        {/* Feature Tags */}
        <div className="flex flex-wrap gap-1">
          {listing.road_frontage && <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[10px]">⚠️ 路衝</span>}
          {listing.orientation && <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded text-[10px]">🧭 坐北朝南</span>}
          {listing.school_district === '優秀學區' && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px]">🎓 優質學區</span>}
        </div>

        {/* Description */}
        {listing.description && (
          <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100">
            {listing.description}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-slate-100">
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-1.5 bg-white border border-slate-300 text-slate-700 rounded text-xs font-bold hover:bg-slate-50"
            >
              編輯細節
            </button>
            {listing.edit_status === 'boss_edited' ? (
              <button onClick={handleApprove} className="flex-1 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 shadow-sm">
                審核上市 ✓
              </button>
            ) : (
              <button onClick={() => setIsPreviewingLine(true)} className="px-3 py-1.5 border border-[#06C755] text-[#06C755] rounded hover:bg-[#06C755]/10">
                LINE
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button onClick={togglePriceDrop} className={`text-[10px] font-bold ${listing.price_drop ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}>
              {listing.price_drop ? '取消降價' : '標記降價'}
            </button>
            <button onClick={markSold} className="text-[10px] font-bold text-slate-400 hover:text-slate-800">
              標記售出
            </button>
          </div>
        </div>
      </div>

      {isPreviewingLine && (
        <LineCardPreview listing={listing} onClose={() => setIsPreviewingLine(false)} />
      )}
    </div>
  );
};

export default PropertyCard;
