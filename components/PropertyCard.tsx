
import React, { useState } from 'react';
import { PropertyListing } from '../types';

interface PropertyCardProps {
  listing: PropertyListing;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<PropertyListing>) => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ listing, onDelete, onUpdate }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ ...listing });

  const handleSave = () => {
    onUpdate(listing.id, editData);
    setIsEditing(false);
  };

  // 格式化顯示：若為 null 則顯示「抓取失敗」
  const renderValue = (val: string | null) => {
    if (val === null || val === undefined || val === '') {
      return <span className="text-slate-400 italic font-normal">抓取失敗</span>;
    }
    return <span className="text-slate-800">{val}</span>;
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border border-blue-500 p-6 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">手動編輯資料</h3>
          <button onClick={() => setIsEditing(false)} className="text-slate-400">✕</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} placeholder="地址" />
          <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.price || ''} onChange={(e) => setEditData({ ...editData, price: e.target.value })} placeholder="價格" />
          <div className="grid grid-cols-2 gap-2">
            <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.beds || ''} onChange={(e) => setEditData({ ...editData, beds: e.target.value })} placeholder="臥室" />
            <input className="w-full p-2 bg-slate-50 border rounded text-sm" value={editData.baths || ''} onChange={(e) => setEditData({ ...editData, baths: e.target.value })} placeholder="衛浴" />
          </div>
          <textarea className="w-full p-2 bg-slate-50 border rounded text-sm h-24" value={editData.description || ''} onChange={(e) => setEditData({ ...editData, description: e.target.value })} placeholder="房屋描述" />
        </div>
        <button onClick={handleSave} className="w-full py-3 bg-blue-600 text-white rounded font-bold">儲存</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-full">
      {/* 圖片展示區 */}
      <div className="relative group">
        <div className="aspect-[4/3] bg-slate-100">
          <img src={listing.images[currentImageIndex]} alt="Property" className="w-full h-full object-cover transition-opacity duration-300" />
        </div>

        {/* 原生滾動縮圖列 */}
        <div className="flex gap-2 overflow-x-auto p-2 bg-black/5 no-scrollbar">
          {listing.images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentImageIndex(idx)}
              className={`flex-shrink-0 w-16 h-12 rounded-sm overflow-hidden border-2 transition-all ${currentImageIndex === idx ? 'border-blue-500 scale-105' : 'border-transparent opacity-60'}`}
            >
              <img src={img} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <button
          onClick={() => onDelete(listing.id)}
          className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>

      {/* 資訊展示區 (11 欄位) */}
      <div className="p-5 flex-1 flex flex-col space-y-4">
        <div className="flex justify-between items-start border-b border-slate-100 pb-3">
          <div>
            {/* Tag 區域：地區、價格狀態、上市狀態 */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {listing.region && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shadow-sm border ${listing.region.toLowerCase().includes('peoria') ? 'bg-green-100 text-green-700 border-green-200' :
                    listing.region.toLowerCase().includes('glendale') ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      listing.region.toLowerCase().includes('phoenix') ? 'bg-pink-100 text-pink-700 border-pink-200' :
                        'bg-white text-slate-500 border-slate-200'
                  }`}>
                  📍 {listing.region}
                </span>
              )}
              {listing.priceStatus && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                  💰 {listing.priceStatus}
                </span>
              )}
              {listing.listingStatus && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                  🏷️ {listing.listingStatus}
                </span>
              )}
            </div>

            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{listing.displayId}</div>
            <h3 className="text-base font-bold text-slate-800 leading-tight mt-1">{renderValue(listing.address)}</h3>
          </div>
          <div className="text-[10px] text-slate-400 font-mono text-right">{listing.createdAt} 加入</div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">售價</div>
            <div className="font-bold text-blue-700 text-sm">{renderValue(listing.price)}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">房型</div>
            <div className="font-semibold">{listing.beds || '?'} 房 / {listing.baths || '?'} 衛</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">Sq Ft</div>
            <div className="font-semibold">{renderValue(listing.sqft)}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">Sq Ft Lot</div>
            <div className="font-semibold">{renderValue(listing.sqftLot)}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">建造年份</div>
            <div className="font-semibold">{renderValue(listing.yearBuilt)}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-slate-400 font-medium">上市天數</div>
            <div className="font-semibold">{renderValue(listing.daysOnMarket)}</div>
          </div>
          <div className="col-span-2 space-y-0.5 pt-1 border-t border-slate-50">
            <div className="text-slate-400 font-medium">ARMLS</div>
            <div className="font-mono text-[11px]">{renderValue(listing.armls)}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-slate-400 text-xs font-medium">房屋描述</div>
          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed italic border-l-2 border-slate-100 pl-3">
            {renderValue(listing.description)}
          </p>
        </div>

        <div className="flex gap-2 pt-4 mt-auto">
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-2 border border-slate-200 rounded text-[11px] font-bold text-slate-500 hover:bg-slate-50">網頁</a>
          <button onClick={() => setIsEditing(true)} className="flex-1 py-2 bg-slate-800 text-white rounded text-[11px] font-bold">編輯</button>
        </div>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default PropertyCard;
