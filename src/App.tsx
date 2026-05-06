import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
  ComposedChart,
  Bar,
  Line
} from 'recharts';
import { Search, Loader2, Info, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface TickStat {
  price: number;
  accumulatedVol: number;
  buyVol: number;
  sellVol: number;
  unknownVol: number;
}

const getDatesInRange = (start: Date | null, end: Date | null) => {
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
     return [];
  }

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export default function App() {
  const [symbol, setSymbol] = useState("41I1G5000");
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date("2026-05-06T00:00:00"),
    new Date("2026-05-06T00:00:00")
  ]);
  const [startDate, endDate] = dateRange;
  const [data, setData] = useState<TickStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupSize, setGroupSize] = useState<number>(1.0);
  const [pivotPriceStr, setPivotPriceStr] = useState<string>(() => localStorage.getItem("pivotPrice") || "");
  const [isDragging, setIsDragging] = useState(false);
  const [positionType, setPositionType] = useState<"LONG" | "SHORT" | null>(() => localStorage.getItem("positionType") as ("LONG" | "SHORT" | null));
  const [currentPriceStr, setCurrentPriceStr] = useState<string>(() => localStorage.getItem("currentPrice") || "");

  useEffect(() => {
    localStorage.setItem("pivotPrice", pivotPriceStr);
  }, [pivotPriceStr]);

  useEffect(() => {
    localStorage.setItem("currentPrice", currentPriceStr);
  }, [currentPriceStr]);

  useEffect(() => {
    if (positionType) {
      localStorage.setItem("positionType", positionType);
    } else {
      localStorage.removeItem("positionType");
    }
  }, [positionType]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const datesToFetch = getDatesInRange(startDate, endDate);
      if (datesToFetch.length === 0) {
         setError("Ngày không hợp lệ. Vui lòng chọn ngày và đảm bảo Từ ngày <= Đến ngày.");
         setData([]);
         setLoading(false);
         return;
      }

      if (datesToFetch.length > 30) {
         setError("Chỉ hỗ trợ quét tối đa 30 ngày cùng lúc.");
         setData([]);
         setLoading(false);
         return;
      }

      const aggregated = new Map<number, TickStat>();

      const promises = datesToFetch.map(d => {
        const query = `
          query GetKrxTicksStatsPerSideBySymbol {
            GetKrxTicksStatsPerSideBySymbol(symbol: "${symbol}", date: "${d}", board: 2) {
              price
              accumulatedVol
              buyVol
              sellVol
              unknownVol
            }
          }
        `;
        return axios.post("/api/dnse", { query }).catch(() => null);
      });

      const results = await Promise.all(promises);
      
      results.forEach(res => {
         if (!res) return;
         const stats = res.data?.data?.GetKrxTicksStatsPerSideBySymbol;
         if (stats && Array.isArray(stats)) {
            stats.forEach(item => {
               const existing = aggregated.get(item.price);
               if (existing) {
                  existing.accumulatedVol += item.accumulatedVol;
                  existing.buyVol += item.buyVol;
                  existing.sellVol += item.sellVol;
                  existing.unknownVol += item.unknownVol;
               } else {
                  aggregated.set(item.price, { ...item });
               }
            });
         }
      });

      const finalStats = Array.from(aggregated.values());
      const sorted = finalStats.sort((a, b) => a.price - b.price);
      if (sorted.length > 0) {
        setData(sorted);
      } else {
        setError("Không có dữ liệu cho mã và thời gian này.");
        setData([]);
      }
    } catch (err: any) {
      console.error(err);
      setError("Lỗi kết nối hoặc lấy dữ liệu thất bại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const groupedData = useMemo(() => {
    if (data.length === 0) return [];
    if (groupSize <= 0.1) return data;

    const grouped = new Map<number, TickStat>();
    
    data.forEach(d => {
      // Convert to integer multiples to avoid floating point issues
      const factor = 1 / groupSize;
      const bucketPrice = Math.floor(d.price * factor + 0.0001) / factor;
      const key = Number(bucketPrice.toFixed(2));
      
      const existing = grouped.get(key);
      if (existing) {
        existing.accumulatedVol += d.accumulatedVol;
        existing.buyVol += d.buyVol;
        existing.sellVol += d.sellVol;
        existing.unknownVol += d.unknownVol;
      } else {
        grouped.set(key, { ...d, price: key });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.price - b.price);
  }, [data, groupSize]);

  const handleMouseDown = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      setIsDragging(true);
      setPivotPriceStr(state.activePayload[0].payload.price.toString());
    }
  };

  const handleMouseMove = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      setPivotPriceStr(state.activePayload[0].payload.price.toString());
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const totalBuy = useMemo(() => groupedData.reduce((acc, curr) => acc + curr.buyVol, 0), [groupedData]);
  const totalSell = useMemo(() => groupedData.reduce((acc, curr) => acc + curr.sellVol, 0), [groupedData]);
  const totalVol = useMemo(() => groupedData.reduce((acc, curr) => acc + curr.accumulatedVol, 0), [groupedData]);

  const vwap = useMemo(() => {
    if (data.length === 0) return { buy: 0, sell: 0, total: 0 };
    
    let sumBuy = 0, sumSell = 0, sumTotal = 0;
    let tBuy = 0, tSell = 0, tTotal = 0;

    data.forEach(d => {
      sumBuy += d.price * d.buyVol;
      sumSell += d.price * d.sellVol;
      sumTotal += d.price * d.accumulatedVol;
      tBuy += d.buyVol;
      tSell += d.sellVol;
      tTotal += d.accumulatedVol;
    });

    return {
      buy: tBuy > 0 ? sumBuy / tBuy : 0,
      sell: tSell > 0 ? sumSell / tSell : 0,
      total: tTotal > 0 ? sumTotal / tTotal : 0
    };
  }, [data]);

  const poc = useMemo(() => {
    if (groupedData.length === 0) return null;
    return groupedData.reduce((prev, current) => (prev.accumulatedVol > current.accumulatedVol) ? prev : current);
  }, [groupedData]);

  const splitAnalysis = useMemo(() => {
    const pivot = parseFloat(pivotPriceStr);
    if (isNaN(pivot) || data.length === 0) return null;

    // Split based on raw data to be accurate to the input price
    const aboveOrEqual = data.filter(d => d.price >= pivot);
    const below = data.filter(d => d.price < pivot);

    const volAbove = aboveOrEqual.reduce((acc, d) => acc + d.accumulatedVol, 0);
    const buyAbove = aboveOrEqual.reduce((acc, d) => acc + d.buyVol, 0);
    const sellAbove = aboveOrEqual.reduce((acc, d) => acc + d.sellVol, 0);

    const volBelow = below.reduce((acc, d) => acc + d.accumulatedVol, 0);
    const buyBelow = below.reduce((acc, d) => acc + d.buyVol, 0);
    const sellBelow = below.reduce((acc, d) => acc + d.sellVol, 0);

    return {
      pivot,
      above: { vol: volAbove, buy: buyAbove, sell: sellAbove },
      below: { vol: volBelow, buy: buyBelow, sell: sellBelow }
    };
  }, [pivotPriceStr, data]);

  const getInsight = () => {
    if (!splitAnalysis || !poc) return null;
    const p = splitAnalysis.pivot;
    const pocP = poc.price;
    const currentPrice = currentPriceStr ? parseFloat(currentPriceStr) : null;

    let message = "";
    let sentiment = "neutral";
    let title = "";

    if (p < pocP) {
       title = "CẢNH BÁO ÁP LỰC BÁN (CẢN TRÊN)";
       message = `Bạn đang phân tích mức giá ${p}, nhưng lõi thanh khoản (POC) tập trung ở mức cao hơn ${pocP}. Nếu nắm giữ vị thế tại đây, hãy cẩn trọng lực bán mạnh khi giá phục hồi lên vùng POC (nơi lượng lớn dòng tiền đang chờ hòa vốn).`;
       sentiment = "negative";
    } else if (p > pocP) {
       title = "TÍN HIỆU HỖ TRỢ VÙNG DƯỚI";
       message = `Mức giá ${p} đang nằm trên vùng POC (${pocP}). Vùng ${pocP} với thanh khoản dày đặc sẽ đóng vai trò hỗ trợ rất tốt. Lực mua chủ động tại các vùng giá đỏ đã giúp nâng đỡ thị trường.`;
       sentiment = "positive";
    } else {
       title = "ĐANG Ở VÙNG GIẰNG CO CỐT LÕI (POC)";
       message = `Mức ${p} chính là "Point of Control" - mức giá khớp lệnh nhiều nhất. Đây là điểm tranh chấp quyết liệt nhất giữa bên Mua và bên Bán. Hướng bứt phá khỏi mức này sẽ quyết định xu hướng tiếp theo.`;
       sentiment = "neutral";
    }

    if (positionType) {
       const isProfitablePosition = currentPrice !== null && !isNaN(currentPrice) && (
          (positionType === "LONG" && currentPrice > p) ||
          (positionType === "SHORT" && currentPrice < p)
       );
       
       let pnlMessage = "";
       if (currentPrice !== null && !isNaN(currentPrice)) {
          const diff = Math.abs(currentPrice - p).toFixed(1);
          pnlMessage = `Đang ${isProfitablePosition ? 'LÃI' : 'LỖ'} ${diff} điểm so với giá TT (${currentPrice}). `;
       }

       if (positionType === "LONG") {
          if (p < pocP) {
             title = "VỊ THẾ LONG: RỦI RO ÁP LỰC BÁN";
             message = pnlMessage + `Giá vốn LONG (${p}) đang nằm dưới vùng cản POC (${pocP}). Cẩn trọng khi giá hồi lên vùng cản vì áp lực xả hàng sẽ gia tăng. Nếu có lãi nên tận dụng nhịp hồi để hiện thực hóa.`;
             sentiment = "negative";
          } else if (p > pocP) {
             title = "VỊ THẾ LONG: ĐANG ĐƯỢC HỖ TRỢ TỐT";
             message = pnlMessage + `Giá vốn LONG (${p}) đang nằm trên hỗ trợ mạnh POC (${pocP}). Vùng thanh khoản dày bên dưới sẽ nâng đỡ giá tốt. Có thể an tâm nắm giữ nếu giá không gãy mốc POC.`;
             sentiment = "positive";
          } else {
             title = "VỊ THẾ LONG: TỬ CHIẾN POC";
             message = pnlMessage + `Điểm vào LONG chính là điểm POC (${pocP}). Rủi ro cao do phe Mua-Bán đang giằng co kịch liệt. Cần theo dõi chặt sự đột biến của lực Mua chủ động để kịp hành động.`;
             sentiment = "neutral";
          }
       } else if (positionType === "SHORT") {
          if (p < pocP) {
             title = "VỊ THẾ SHORT: ĐANG CÓ LỢI THẾ CẢN TRÊN";
             message = pnlMessage + `Giá vốn SHORT (${p}) đang được bảo vệ bởi vùng cản POC (${pocP}) phía trên. Xu hướng ủng hộ cho lực Bán. Thiết lập mức dừng lỗ khắt khe nếu giá bứt phá vượt hẳn lên trên POC.`;
             sentiment = "positive";
          } else if (p > pocP) {
             title = "VỊ THẾ SHORT: RỦI RO HỖ TRỢ DƯỚI DÀY";
             message = pnlMessage + `Giá vốn SHORT (${p}) đang đâm vào vùng hỗ trợ cứng POC (${pocP}) bên dưới. Lực bắt đáy có thể dâng cao bất ngờ đẩy giá lên. Rất rủi ro, cân nhắc đóng lệnh hoặc quản trị vốn chặt.`;
             sentiment = "negative";
          } else {
             title = "VỊ THẾ SHORT: TỬ CHIẾN POC";
             message = pnlMessage + `Điểm vào SHORT chính là điểm POC (${pocP}). Cơ hội là 50/50. Cần quan sát sát sao áp lực Bán chủ động tại ranh giới này để kiểm soát rủi ro.`;
             sentiment = "neutral";
          }
       }
    }
    
    return { title, message, sentiment };
  };

  const insight = getInsight();
  const buyPercent = totalVol > 0 ? (totalBuy / (totalBuy + totalSell)) * 100 : 0;

  return (
    <div className="w-full h-screen bg-[#0A0B0D] text-gray-300 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-[#0F1115] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center font-bold text-black border border-orange-600 shadow-[0_0_10px_rgba(249,115,22,0.3)]">Q</div>
            <h1 className="text-xl font-bold tracking-tight text-white">DNSE <span className="text-orange-500">QUANT</span></h1>
          </div>
          <div className="h-6 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="w-32 px-3 py-1.5 bg-[#0A0B0D] border border-white/10 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all font-mono text-sm text-white uppercase"
            />
            <DatePicker
              selectsRange={true}
              startDate={startDate}
              endDate={endDate}
              onChange={(update: [Date | null, Date | null]) => {
                setDateRange(update);
              }}
              dateFormat="dd/MM/yyyy"
              placeholderText="Chọn khoảng thời gian"
              className="w-[200px] px-3 py-1.5 bg-[#0A0B0D] border border-white/10 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all font-mono text-sm text-white"
            />
            <div className="flex items-center gap-2 border-l border-white/10 pl-2">
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Gộp giá:</span>
              <select
                value={groupSize}
                onChange={e => setGroupSize(Number(e.target.value))}
                className="bg-[#0A0B0D] text-white border border-white/10 rounded px-2 py-1 text-sm font-mono focus:border-orange-500 outline-none w-20"
              >
                <option value={0.1}>0.1</option>
                <option value={0.5}>0.5</option>
                <option value={1.0}>1.0</option>
                <option value={2.0}>2.0</option>
                <option value={5.0}>5.0</option>
              </select>
            </div>
            <button 
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-1.5 bg-orange-600 text-white rounded text-sm font-bold hover:bg-orange-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-70 shadow-lg shadow-orange-900/20 ml-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-2" /> SCAN</>}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 text-right">Point of Control</span>
            {poc ? (
              <span className="text-sm font-mono text-white font-bold">{poc.price} <span className="text-gray-500 text-xs font-normal ml-1">({poc.accumulatedVol.toLocaleString()} vol)</span></span>
            ) : (
              <span className="text-sm font-mono text-gray-500">---</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-80 bg-[#0F1115] border-r border-white/10 p-5 flex flex-col gap-6 overflow-y-auto custom-scrollbar shrink-0">
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-orange-500"/> Market Sentiment</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-gray-400">Toàn thị trường</span>
                  <span className={cn("text-xs font-mono font-bold", buyPercent > 50 ? "text-green-400" : "text-red-400")}>
                    {buyPercent.toFixed(1)}% Buy
                  </span>
                </div>
                <div className="w-full h-2 bg-[#0A0B0D] rounded-full overflow-hidden flex border border-white/5">
                  <div className="h-full bg-green-500" style={{ width: `${buyPercent}%` }}></div>
                  <div className="h-full bg-red-500" style={{ width: `${100 - buyPercent}%` }}></div>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-gray-500 font-mono">Buy: {totalBuy.toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-mono">Sell: {totalSell.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-white/5 rounded border border-white/5 flex flex-col gap-3">
                 <div>
                   <span className="text-[10px] uppercase tracking-widest text-gray-500">Total Volume</span>
                   <div className="text-2xl font-mono text-orange-400 font-bold">{totalVol.toLocaleString()}</div>
                 </div>
                 
                 <div className="pt-3 border-t border-white/5 space-y-2">
                   <div className="text-[10px] uppercase tracking-widest text-gray-400">Giá trung bình (VWAP)</div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-gray-500">Chung</span>
                     <span className="text-sm font-mono text-white font-bold">{vwap.total.toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-gray-500">Mua chủ động</span>
                     <span className="text-sm font-mono text-green-400 font-bold">{vwap.buy.toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-gray-500">Bán chủ động</span>
                     <span className="text-sm font-mono text-red-400 font-bold">{vwap.sell.toFixed(2)}</span>
                   </div>
                 </div>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-4">
                 <h3 className="text-[11px] uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                   <Target className="w-4 h-4" /> Phân tách theo mức giá
                 </h3>
                 <input 
                   type="number"
                   step="0.1"
                   placeholder="Nhập giá vốn (VD: 2045) hoặc click vào chart"
                   value={pivotPriceStr}
                   onChange={e => setPivotPriceStr(e.target.value)}
                   className="w-full px-3 py-2 bg-[#0A0B0D] border border-white/10 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm text-white"
                 />
                 <div className="flex gap-2">
                   <button 
                     onClick={() => setPositionType(positionType === 'LONG' ? null : 'LONG')}
                     className={cn("flex-1 py-2 text-xs font-bold rounded border transition-all", 
                        positionType === 'LONG' ? "bg-green-500/20 border-green-500 text-green-400" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                     )}>
                     LONG
                   </button>
                   <button 
                     onClick={() => setPositionType(positionType === 'SHORT' ? null : 'SHORT')}
                     className={cn("flex-1 py-2 text-xs font-bold rounded border transition-all", 
                        positionType === 'SHORT' ? "bg-red-500/20 border-red-500 text-red-400" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                     )}>
                     SHORT
                   </button>
                 </div>
                 {positionType && (
                   <input
                     type="number"
                     step="0.1"
                     placeholder="Giá thị trường hiện tại"
                     value={currentPriceStr}
                     onChange={e => setCurrentPriceStr(e.target.value)}
                     className="w-full px-3 py-2 bg-[#0A0B0D] border border-white/10 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm text-white"
                   />
                 )}
              </div>

              {splitAnalysis && (
                <div className="space-y-4">
                  {/* Upper Half */}
                  <div className="bg-[#0A0B0D] p-3 rounded border border-white/5">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-[10px] uppercase tracking-widest text-orange-400">Từ {splitAnalysis.pivot} → Max</span>
                      <span className="text-xs font-mono text-white font-bold">{splitAnalysis.above.vol.toLocaleString()} vol</span>
                    </div>
                    {splitAnalysis.above.vol > 0 && (
                      <>
                        <div className="w-full h-1.5 bg-[#0F1115] rounded-full overflow-hidden flex border border-white/5 mt-1">
                          <div className="h-full bg-green-500" style={{ width: `${(splitAnalysis.above.buy / splitAnalysis.above.vol) * 100}%` }}></div>
                          <div className="h-full bg-red-500" style={{ width: `${(splitAnalysis.above.sell / splitAnalysis.above.vol) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-green-400/80 font-mono">M: {splitAnalysis.above.buy.toLocaleString()}</span>
                          <span className="text-[9px] text-red-400/80 font-mono">B: {splitAnalysis.above.sell.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Lower Half */}
                  <div className="bg-[#0A0B0D] p-3 rounded border border-white/5">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-[10px] uppercase tracking-widest text-purple-400">Từ Min → {Number((splitAnalysis.pivot - 0.01).toFixed(2))}</span>
                      <span className="text-xs font-mono text-white font-bold">{splitAnalysis.below.vol.toLocaleString()} vol</span>
                    </div>
                    {splitAnalysis.below.vol > 0 && (
                      <>
                        <div className="w-full h-1.5 bg-[#0F1115] rounded-full overflow-hidden flex border border-white/5 mt-1">
                          <div className="h-full bg-green-500" style={{ width: `${(splitAnalysis.below.buy / splitAnalysis.below.vol) * 100}%` }}></div>
                          <div className="h-full bg-red-500" style={{ width: `${(splitAnalysis.below.sell / splitAnalysis.below.vol) * 100}%` }}></div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-green-400/80 font-mono">M: {splitAnalysis.below.buy.toLocaleString()}</span>
                          <span className="text-[9px] text-red-400/80 font-mono">B: {splitAnalysis.below.sell.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {splitAnalysis && insight && (
            <section className="flex-1 border-t border-white/10 pt-6">
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-orange-500 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" /> Vị thế tại {splitAnalysis.pivot}
              </h3>
              
              <div className={cn(
                "rounded-lg p-4 text-xs font-medium leading-relaxed border mb-4 shadow-lg",
                insight.sentiment === "positive" ? "bg-green-500/10 border-green-500/20 text-green-300 shadow-green-900/10" :
                insight.sentiment === "negative" ? "bg-red-500/10 border-red-500/20 text-red-300 shadow-red-900/10" :
                "bg-blue-500/10 border-blue-500/20 text-blue-300 shadow-blue-900/10"
              )}>
                <p className={cn(
                  "font-bold mb-1 opacity-80",
                  insight.sentiment === "positive" ? "text-green-400" :
                  insight.sentiment === "negative" ? "text-red-400" :
                  "text-blue-400"
                )}>{insight.title}</p>
                {insight.message}
              </div>
            </section>
          )}
        </aside>

        {/* Chart Area */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar relative">
          {error && (
            <div className="absolute top-6 left-6 right-6 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded z-10 text-sm font-medium">
              {error}
            </div>
          )}

          {!error && groupedData.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">Tick Data Volume Profile</h2>
                <div className="flex gap-4 text-[10px] uppercase tracking-widest text-gray-500 font-medium">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded hover:scale-110 transition-transform bg-[#22c55e]"></span> Mua chủ động</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded hover:scale-110 transition-transform bg-[#ef4444]"></span> Bán chủ động</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-orange-500"></span> KL Tích lũy (Trend)</span>
                </div>
              </div>
              
              <div className="flex-1 w-full bg-[#0F1115] border border-white/5 rounded-lg p-4 shadow-lg shadow-black/20">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={groupedData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="price" 
                      tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'monospace' }} 
                      tickLine={false} 
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      domain={['dataMin', 'dataMax']}
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'monospace' }} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    
                    <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.02)', stroke: '#f97316', strokeWidth: 1, strokeDasharray: '4 4'}}
                      contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.1)', color: '#D1D5DB', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)' }}
                      formatter={(value: number, name: string) => {
                         if (name === 'buyVol') return [<span className="font-semibold text-green-400">{value.toLocaleString()}</span>, "Mua chủ động"];
                         if (name === 'sellVol') return [<span className="font-semibold text-red-500">{value.toLocaleString()}</span>, "Bán chủ động"];
                         if (name === 'accumulatedVol') return [<span className="font-semibold text-orange-400">{value.toLocaleString()}</span>, "Tổng KL bước giá"];
                         return [value, name];
                      }}
                      labelFormatter={(label) => `Mức giá: ${label}`}
                      itemStyle={{ paddingBottom: '4px' }}
                    />
                    
                    <Bar yAxisId="left" dataKey="buyVol" stackId="a" fill="#22c55e" name="Mua chủ động" maxBarSize={30} radius={[0, 0, 2, 2]} />
                    <Bar yAxisId="left" dataKey="sellVol" stackId="a" fill="#ef4444" name="Bán chủ động" maxBarSize={30} radius={[2, 2, 0, 0]} />
                    
                    <Line yAxisId="left" type="monotone" dataKey="accumulatedVol" stroke="#f97316" strokeWidth={2} name="Tổng KL bước giá" dot={false} activeDot={{ r: 5, stroke: '#f97316', fill: '#0A0B0D', strokeWidth: 2 }} />

                    {splitAnalysis && !isNaN(splitAnalysis.pivot) && (
                      <ReferenceLine yAxisId="left" x={splitAnalysis.pivot} stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 3" label={{ position: 'top', value: 'PIVOT', fill: '#3b82f6', fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' }} />
                    )}

                    <Brush 
                      dataKey="price" 
                      height={20} 
                      stroke="#4B5563" 
                      fill="#0F1115"
                      tickFormatter={(val) => val.toString()}
                      travellerWidth={8}
                      style={{ fontSize: '10px', fontFamily: 'monospace', fill: '#9CA3AF' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : !loading && (
             <div className="flex-1 flex flex-col items-center justify-center opacity-30 cursor-default select-none pointer-events-none">
                <Activity className="w-32 h-32 text-gray-500 mb-6" />
                <h2 className="text-2xl font-bold text-gray-500 tracking-widest">DNSE QUANT</h2>
                <p className="text-gray-500 font-mono mt-2 uppercase tracking-wide">Ready for analysis</p>
             </div>
          )}
        </div>
      </main>

      {/* Styles for scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

