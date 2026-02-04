
import React from 'react';
import { PropertyListing } from '../types';

interface LineCardPreviewProps {
    listing: PropertyListing;
    onClose: () => void;
}

const LineCardPreview: React.FC<LineCardPreviewProps> = ({ listing, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-[320px] bg-[#FFFFFF] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 bg-black/20 hover:bg-black/40 text-white rounded-full flex items-center justify-center z-10 transition-colors"
                >
                    ✕
                </button>

                {/* LINE Message Mockup App Header */}
                <div className="bg-[#526799] px-4 py-2 flex items-center gap-2">
                    <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                        <span className="text-[10px] text-[#526799] font-bold">L</span>
                    </div>
                    <span className="text-white text-xs font-bold">LINE Preview</span>
                </div>

                {/* Flex Message Content */}
                <div className="bg-[#E7EDF3] p-4">
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                        {/* Image */}
                        <div className="aspect-[4/3] bg-slate-100">
                            {listing.images && listing.images.length > 0 ? (
                                <img src={listing.images[0]} alt="Property" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">No Image</div>
                            )}
                        </div>

                        {/* Body */}
                        <div className="p-4 space-y-2">
                            <div className="flex justify-between items-start">
                                <span className="text-[#1DB14F] text-[10px] font-bold border border-[#1DB14F] px-1 rounded">
                                    {listing.listing_status === 'listed' ? 'ACTIVE' : 'PRE-MARKET'}
                                </span>
                                {listing.price_drop && <span className="text-red-500 text-[10px] font-bold">Price Reduced!</span>}
                            </div>

                            <h3 className="text-lg font-black text-slate-900 leading-tight">
                                {listing.price || 'Contact for Price'}
                            </h3>

                            <p className="text-xs text-slate-500 font-bold leading-snug">
                                {listing.address}
                            </p>

                            <div className="flex gap-4 py-2 border-y border-slate-100 text-[10px] text-slate-600 font-bold">
                                <span>🛏 {listing.beds} Beds</span>
                                <span>🚿 {listing.baths} Baths</span>
                                <span>📐 {listing.sqft} sqft</span>
                            </div>

                            <div className="pt-2">
                                <div className="bg-slate-50 p-2 rounded flex justify-between items-center">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Dist. to TSMC</span>
                                    <span className="text-xs font-black text-indigo-600">
                                        {listing.tsmc_distance_miles ? `${listing.tsmc_distance_miles.toFixed(1)} miles` : 'Calculating...'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Footer UI - LINE Style Buttons */}
                        <div className="border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
                            <button className="py-3 text-[11px] font-bold text-[#576B95] hover:bg-slate-50 transition-colors">
                                查看詳情
                            </button>
                            <button className="py-3 text-[11px] font-bold text-[#576B95] hover:bg-slate-50 transition-colors">
                                聯絡經紀
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-white p-4 flex flex-col gap-2">
                    <button
                        className="w-full py-3 bg-[#06C755] text-white rounded-lg font-bold text-sm shadow-lg shadow-[#06C755]/20 hover:bg-[#05b34c] transition-all"
                        onClick={() => alert('已複製 LINE 訊息連結')}
                    >
                        發送 LINE 訊息
                    </button>
                    <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
                        Design preview for Arizona Real Estate
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LineCardPreview;
