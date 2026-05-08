import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline as LeafletPolyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Loader2, Mountain, Search, TrendingDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

const LISBON_CENTER: [number, number] = [38.7223, -9.1393];

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});


function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

interface RouteData {
  summary: {
    distanceMeters: number;
    durationSeconds: number;
    elevationGainMeters: number;
    elevationLossMeters: number;
    maxUphillSlopePercent: string;
    maxDownhillSlopePercent: string;
    difficultyScore: number;
  };
  segments: {
    positions: [number, number][]; // Array of [lat, lng]
    distanceMeters: number;
    elevationDeltaMeters: number;
    slopePercent: number;
    category: string;
    color: string;
  }[];
  elevationProfile: {
    distanceMeters: number;
    elevationMeters: number;
  }[];
}

import { PlacesAutocomplete } from '@/components/PlacesAutocomplete';

export default function App() {
  const [originStr, setOriginStr] = useState('Praça do Comércio');
  const [originPoint, setOriginPoint] = useState<[number, number] | undefined>([38.7075, -9.1364]);
  const [destStr, setDestStr] = useState('Castelo de São Jorge');
  const [destPoint, setDestPoint] = useState<[number, number] | undefined>([38.7139, -9.1334]);
  
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setOriginPoint([lat, lng]);
          setOriginStr('Localização Atual');
        },
        (error) => {
          console.error(error);
          setError('Não foi possível obter a localização atual. Verifique as permissões do navegador.');
        }
      );
    } else {
      setError('Geolocalização não suportada no seu navegador.');
    }
  };

  // Use Photon API from Komoot for free geocoding
  const geocode = async (address: string) => {
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address + ', Lisboa')}&limit=1&lat=38.7223&lon=-9.1393`);
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return [lat, lng] as [number, number];
      }
      return null;
    } catch (e) {
      console.error("Geocoding error", e);
      return null;
    }
  };

  const handleAnalyze = async () => {
    if (!originStr || !destStr) {
      setError('Por favor, informe a origem e o destino.');
      return;
    }
    setError(null);
    setIsLoading(true);
    setRouteData(null);
    
    try {
      let startPoint = originPoint;
      // We only geocode if it's not 'Localização Atual' AND the user just typed without selecting from autocomplete
      // To be safe, if we have an originPoint, we assume it's from autocomplete or current location.
      // But if the user typed "bla bla bla" and didn't select anything, originPoint might be stale.
      // A simple heuristic: if originPoint is undefined, geocode.
      // If we want to be very precise, we geocode if the string was typed.
      // Let's just rely on autocomplete to set the point, and if it's missing, try geocoding.
      if (!startPoint && originStr !== 'Localização Atual') {
         const geocodedStart = await geocode(originStr);
         if (geocodedStart) startPoint = geocodedStart;
      }

      let endPoint = destPoint;
      if (!endPoint) {
         const geocodedEnd = await geocode(destStr);
         if (geocodedEnd) endPoint = geocodedEnd;
      }
      
      if (!startPoint || !endPoint) {
         throw new Error('Não foi possível encontrar a rota. Selecione um local válido nas sugestões.');
      }
      
      setOriginPoint(startPoint);
      setDestPoint(endPoint);

      // We still use our backend to calculate route over Google Routes API (which requires the key on the backend)
      // or we can fallback to OpenRouterSvc if we want 100% free, but since the user just wants the MAP to be free,
      // Leaflet achieves that. Wait, the user asked "Quero fazer ele de forma q nao tenha q gastar nada free",
      // meaning they probably don't have a Google Maps API Key at all.
      // So we need to switch the routing and elevation to a free service as well.
      
      // OpenRouteService OR OSRM for routing, and Open-Elevation for elevation.
      
      // Let's use OSRM official public API with 'foot' profile for accurate pedestrian paths
      const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${startPoint[1]},${startPoint[0]};${endPoint[1]},${endPoint[0]}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      
      if (osrmData.code !== 'Ok' || !osrmData.routes || osrmData.routes.length === 0) {
          throw new Error('Rota não encontrada no OSRM.');
      }
      
      const route = osrmData.routes[0];
      const coordinates = route.geometry.coordinates; // [lng, lat][]
      
      if (coordinates.length < 2) {
          throw new Error('Rota muito curta.');
      }

      const R = 6371e3; // metres
      const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const phi1 = lat1 * Math.PI/180;
          const phi2 = lat2 * Math.PI/180;
          const dPhi = (lat2-lat1) * Math.PI/180;
          const dLam = (lon1-lon2) * Math.PI/180;
          const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
                    Math.cos(phi1) * Math.cos(phi2) *
                    Math.sin(dLam/2) * Math.sin(dLam/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      // 1. Calculate cumulative distance for all original points
      const cumulativeDistances = [0];
      for (let i = 1; i < coordinates.length; i++) {
         const p1 = coordinates[i-1];
         const p2 = coordinates[i];
         const dist = haversine(p1[1], p1[0], p2[1], p2[0]);
         cumulativeDistances.push(cumulativeDistances[i-1] + dist);
      }
      const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];

      // 2. Sample points evenly spaced by DISTANCE to avoid uneven slope blocks
      const numSamples = Math.min(100, Math.max(10, Math.floor(totalDistance / 20))); // scale up to 100 points
      const sampledIndices = [];
      for (let i = 0; i < numSamples; i++) {
         const targetDist = (i / (numSamples - 1)) * totalDistance;
         let closestIdx = 0;
         let minDiff = Infinity;
         for (let j = 0; j < cumulativeDistances.length; j++) {
            const diff = Math.abs(cumulativeDistances[j] - targetDist);
            if (diff < minDiff) { minDiff = diff; closestIdx = j; }
         }
         if (sampledIndices.length === 0 || sampledIndices[sampledIndices.length - 1] !== closestIdx) {
            sampledIndices.push(closestIdx);
         }
      }
      if (sampledIndices[sampledIndices.length - 1] !== coordinates.length - 1) {
         sampledIndices.push(coordinates.length - 1);
      }
      
      const lats = sampledIndices.map(i => coordinates[i][1]).join(',');
      const lons = sampledIndices.map(i => coordinates[i][0]).join(',');
      const elevationRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
      
      if (!elevationRes.ok) {
           throw new Error('Serviço de elevação indisponível no momento.');
      }
      
      const elevationData = await elevationRes.json();
      const sampledElevations = elevationData.elevation; // Array of numbers
      
      let elevationGainMeters = 0;
      let elevationLossMeters = 0;
      let maxUphillSlopePercent = 0;
      let maxDownhillSlopePercent = 0;
      
      const segments = [];
      const elevationProfile = [];
      
      for (let i = 0; i < sampledIndices.length - 1; i++) {
          const startIdx = sampledIndices[i];
          const endIdx = sampledIndices[i+1];
          const elev1 = sampledElevations[i];
          const elev2 = sampledElevations[i+1];
          
          const dist = cumulativeDistances[endIdx] - cumulativeDistances[startIdx];
          const elevationDelta = elev2 - elev1;
          const slopePercent = dist > 0 ? (elevationDelta / dist) * 100 : 0;
          
          if (elevationDelta > 0) elevationGainMeters += elevationDelta;
          if (elevationDelta < 0) elevationLossMeters += Math.abs(elevationDelta);

          // Ignore wild GPS noise for max slopes on very short distances
          if (dist > 5) {
             if (slopePercent > maxUphillSlopePercent) maxUphillSlopePercent = slopePercent;
             if (slopePercent < maxDownhillSlopePercent) maxDownhillSlopePercent = slopePercent;
          }
          
          let category = '';
          let color = '';
          
          // Smoother, pastel Google-Maps-like scale
          if (slopePercent <= -6) { category = 'Descida forte'; color = '#60a5fa'; }
          else if (slopePercent < -2) { category = 'Descida'; color = '#bae6fd'; }
          else if (slopePercent <= 2) { category = 'Plano'; color = '#bbf7d0'; }
          else if (slopePercent <= 5) { category = 'Subida leve'; color = '#fef08a'; }
          else if (slopePercent <= 8) { category = 'Subida média'; color = '#fdba74'; }
          else if (slopePercent <= 12) { category = 'Subida forte'; color = '#f87171'; }
          else { category = 'Subida extrema'; color = '#d8b4fe'; }

          if (i === 0) {
              elevationProfile.push({ distanceMeters: cumulativeDistances[startIdx], elevationMeters: elev1 });
          }
          elevationProfile.push({ distanceMeters: cumulativeDistances[endIdx], elevationMeters: elev2 });

          const segmentPositions: [number, number][] = [];
          for (let j = startIdx; j <= endIdx; j++) {
             segmentPositions.push([coordinates[j][1], coordinates[j][0]]);
          }
          
          segments.push({
             positions: segmentPositions,
             distanceMeters: dist,
             elevationDeltaMeters: elevationDelta,
             slopePercent,
             category,
             color
          });
      }
      
      let difficultyScore = 1 + (elevationGainMeters / 50);
      if (maxUphillSlopePercent > 8) difficultyScore += 1;
      if (maxUphillSlopePercent > 12) difficultyScore += 2;
      difficultyScore = Math.min(10, Math.max(1, Math.round(difficultyScore)));

      setRouteData({
        summary: {
           distanceMeters: route.distance,
           durationSeconds: route.duration,
           elevationGainMeters: Math.round(elevationGainMeters),
           elevationLossMeters: Math.round(elevationLossMeters),
           maxUphillSlopePercent: maxUphillSlopePercent.toFixed(1),
           maxDownhillSlopePercent: maxDownhillSlopePercent.toFixed(1),
           difficultyScore
        },
        segments,
        elevationProfile
      });
      setShowAnalysis(true);
      
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const mapCenter = originPoint || LISBON_CENTER;

  return (
      <div className="flex flex-col h-screen w-full overflow-hidden bg-white">
        <main className="flex-1 flex overflow-hidden relative">
          {/* Map Container using Leaflet */}
          <div className="absolute inset-0 z-0">
            <MapContainer center={LISBON_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={20}
              />
              <ChangeView center={mapCenter} zoom={originPoint ? 14 : 13} />
              
              {originPoint && <Marker position={originPoint} icon={greenIcon} />}
              {destPoint && <Marker position={destPoint} icon={redIcon} />}
              
              {routeData && routeData.segments.map((seg, idx) => (
                 <LeafletPolyline 
                    key={idx}
                    positions={seg.positions}
                    color={seg.color}
                    weight={6}
                    opacity={0.65}
                    lineCap="round"
                    lineJoin="round"
                 />
              ))}
            </MapContainer>
          </div>

          {/* Search Panel (Floating Left) */}
          <aside className="absolute left-0 top-0 w-full sm:w-96 bg-white shadow-xl z-20 sm:m-4 sm:rounded-xl flex flex-col pointer-events-auto h-fit max-h-[50vh] sm:max-h-[calc(100vh-2rem)] overflow-hidden">
            <div className="bg-indigo-600 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-indigo-200" />
                <h1 className="text-lg font-bold">Lisboa em Subidas</h1>
              </div>
              {routeData && (
                 <Button size="sm" variant="secondary" className="text-xs bg-white text-indigo-700 hover:bg-gray-100 h-8" onClick={() => setShowAnalysis(true)}>
                   Ver Análise
                 </Button>
              )}
            </div>
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Origem</label>
                <div className="p-1 bg-gray-50 rounded-lg border border-gray-100">
                  <PlacesAutocomplete 
                    placeholder="Ex. Martim Moniz" 
                    value={originStr} 
                    onChange={(val, point) => {
                       setOriginStr(val);
                       setOriginPoint(point);
                    }}
                    onUseCurrentLocation={handleUseCurrentLocation}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Destino</label>
                <div className="p-1 bg-gray-50 rounded-lg border border-gray-100">
                  <PlacesAutocomplete 
                    placeholder="Ex. Senhora do Monte" 
                    value={destStr} 
                    onChange={(val, point) => {
                      setDestStr(val);
                      setDestPoint(point);
                    }}
                  />
                </div>
              </div>
              
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 py-5 mt-2 shadow-md shrink-0" onClick={handleAnalyze} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {isLoading ? "Analisando rota..." : "Analisar rota"}
              </Button>
              {error && <p className="text-xs text-red-500 font-medium text-center bg-red-50 p-2 rounded-md">{error}</p>}
            </div>
          </aside>

          {/* Legend Panel (Floating Bottom Center) */}
          <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-white/90 backdrop-blur rounded-lg border border-gray-200 shadow-xl px-2 sm:px-4 z-20 overflow-x-auto max-w-[95%]">
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#60a5fa] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Descida Forte</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#bae6fd] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Descida</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#bbf7d0] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Plano</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#fef08a] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Leve</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#fdba74] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Média</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#f87171] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Forte</span>
             </div>
             <div className="flex items-center gap-1.5 px-2">
               <div className="w-3 h-3 bg-[#d8b4fe] rounded-full opacity-90"></div><span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Extrema</span>
             </div>
          </div>

          {/* Analysis Drawer (Right) */}
          {showAnalysis && routeData && (
            <aside className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-white sm:border-l border-gray-200 z-30 flex flex-col p-4 sm:p-6 space-y-6 shadow-2xl overflow-y-auto">
              <div className="flex justify-between items-center border-b pb-4">
                <h3 className="font-bold text-gray-900">Resumo da Rota</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowAnalysis(false)} className="h-8 w-8 text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"><X className="w-4 h-4"/></Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Distância</p>
                  <p className="text-lg font-semibold">{(routeData.summary.distanceMeters / 1000).toFixed(1)} km</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Tempo Est.</p>
                  <p className="text-lg font-semibold">{Math.round(routeData.summary.durationSeconds / 60)} min</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold flex items-center"><Mountain className="w-3 h-3 mr-1"/>Ganho Elev.</p>
                  <p className="text-lg font-semibold text-red-600">+{routeData.summary.elevationGainMeters} m</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase font-bold flex items-center"><TrendingDown className="w-3 h-3 mr-1"/>Perda Elev.</p>
                  <p className="text-lg font-semibold text-blue-600">-{routeData.summary.elevationLossMeters} m</p>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col items-center justify-center">
                <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Dificuldade da Rota</p>
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-extrabold text-indigo-700">{routeData.summary.difficultyScore}<span className="text-lg text-indigo-400 font-medium">/10</span></p>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${routeData.summary.difficultyScore >= 7 ? 'bg-red-100 text-red-700' : routeData.summary.difficultyScore >= 4 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                    {routeData.summary.difficultyScore >= 7 ? 'DIFÍCIL' : routeData.summary.difficultyScore >= 4 ? 'MÉDIA' : 'FÁCIL'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-[11px] text-gray-400 uppercase font-bold">Inclinações Máximas</p>
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-red-700">Subida Máxima</span>
                    <span className="text-[10px] font-bold text-red-500">{routeData.summary.maxUphillSlopePercent}%</span>
                  </div>
                  <div className="w-full bg-red-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-red-600 h-full" style={{ width: `${Math.min(100, Math.max(5, parseFloat(routeData.summary.maxUphillSlopePercent) * 5))}%` }}></div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-blue-700">Descida Máxima</span>
                    <span className="text-[10px] font-bold text-blue-500">{routeData.summary.maxDownhillSlopePercent}%</span>
                  </div>
                  <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full" style={{ width: `${Math.min(100, Math.max(5, Math.abs(parseFloat(routeData.summary.maxDownhillSlopePercent)) * 5))}%` }}></div>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </main>

        {/* Footer Elevation Chart (Only visible when analysis is shown) */}
        {showAnalysis && routeData && (
          <footer className="h-44 bg-white border-t border-gray-200 p-6 flex flex-col z-20 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Perfil de Elevação</h4>
              <span className="text-[10px] text-gray-500">
                0m - {(routeData.summary.distanceMeters / 1000).toFixed(1)}km (Distância)
              </span>
            </div>
            <div className="flex-1 w-full mt-2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={routeData.elevationProfile} margin={{top: 10, right: 0, left: -25, bottom: 0}}>
                  <defs>
                    <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="distanceMeters" 
                    tickFormatter={(val) => `${(val/1000).toFixed(1)}km`}
                    style={{fontSize: '10px'}}
                    stroke="#d1d5db"
                    tick={{fill: '#9ca3af'}}
                  />
                  <YAxis 
                    tickFormatter={(val) => `${val}m`}
                    style={{fontSize: '10px'}}
                    stroke="#d1d5db"
                    tick={{fill: '#9ca3af'}}
                  />
                  <Tooltip 
                    labelFormatter={(val) => `Distância: ${val}m`}
                    formatter={(val) => [`${val}m`, 'Elevação']}
                  />
                  <Area type="monotone" dataKey="elevationMeters" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorElev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </footer>
        )}
      </div>
  );
}
