import React, { useState, useRef, useEffect } from 'react';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { MapPin, Navigation, X, Star } from 'lucide-react';

interface Props {
  placeholder: string;
  value: string;
  onChange: (address: string, location?: [number, number]) => void;
  onUseCurrentLocation?: () => void;
}

const POPULAR_DESTINATIONS = [
  { name: "Praça do Comércio", coords: [38.7077507, -9.1365919] as [number, number] },
  { name: "Castelo de S. Jorge", coords: [38.7139092, -9.1334762] as [number, number] },
  { name: "Miradouro da Senhora do Monte", coords: [38.7190471, -9.132646] as [number, number] },
  { name: "Miradouro de São Pedro de Alcântara", coords: [38.7150172, -9.1441712] as [number, number] },
  { name: "Padrão dos Descobrimentos", coords: [38.6935967, -9.2057285] as [number, number] },
];

export function PlacesAutocomplete({ placeholder, value, onChange, onUseCurrentLocation }: Props) {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const fetchPredictions = (input: string) => {
    if (!input || input.trim().length < 3) {
      setPredictions([]);
      return;
    }
    // Using Photon API from Komoot for free autocomplete
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(input + ' Lisboa')}&limit=5&lat=38.7223&lon=-9.1393`;
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
         if (data && data.features) {
             setPredictions(data.features);
         }
      })
      .catch(e => console.error(e));
  };

  const handleInput = (val: string) => {
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (val.trim().length === 0) {
       setPredictions([]);
       setIsOpen(true); // Open to show popular spots
       return;
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(val);
      setIsOpen(true);
    }, 400);
  }

  const handleSelect = (feature: any) => {
    setIsOpen(false);
    const name = feature.properties?.name || feature.properties?.street || '';
    const city = feature.properties?.city || feature.properties?.state || '';
    const label = [name, city].filter(Boolean).join(', ');
    
    if (feature.geometry?.coordinates) {
       const [lng, lat] = feature.geometry.coordinates;
       onChange(label || name, [lat, lng]);
    } else {
       onChange(label || name);
    }
  };

  const clearInput = () => {
    onChange('');
    setPredictions([]);
    setIsOpen(true);
  };

  const showSuggestions = isOpen && (predictions.length > 0 || value.trim().length === 0);

  return (
    <div className="flex w-full gap-2 relative">
      <Popover open={showSuggestions} onOpenChange={setIsOpen}>
        <PopoverTrigger render={<div className="w-full flex-1 relative group" />} nativeButton={false}>
          <div className="relative w-full">
            <Input 
              value={value} 
              onChange={(e) => handleInput(e.target.value)} 
              onKeyDown={(e) => {
                 if (e.key === ' ' || e.key === 'Enter') {
                    // Prevent PopoverTrigger from intercepting Space/Enter and breaking the typing experience
                    e.stopPropagation();
                 }
              }}
              placeholder={placeholder} 
              className="w-full pr-8"
              onFocus={() => setIsOpen(true)}
            />
            {value && (
               <button 
                 type="button" 
                 onClick={clearInput}
                 className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
               >
                 <X className="h-4 w-4" />
               </button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[320px] p-0" align="start">
          <ScrollArea className="max-h-[300px]">
             
            {value.trim().length === 0 && (
               <div className="py-2">
                 <div className="px-3 text-xs font-semibold text-gray-500 mb-1 tracking-wider uppercase">Mais Famosos</div>
                 {POPULAR_DESTINATIONS.map((dest, i) => (
                    <Button
                      key={`pop-${i}`}
                      variant="ghost"
                      className="w-full justify-start font-normal h-auto py-2 px-3 hover:bg-indigo-50"
                      onClick={() => {
                         onChange(dest.name, dest.coords);
                         setIsOpen(false);
                      }}
                    >
                       <Star className="mr-2 h-4 w-4 shrink-0 text-amber-400" fill="currentColor" />
                       <span className="truncate w-full text-left text-sm">{dest.name}</span>
                    </Button>
                 ))}
               </div>
            )}

            {predictions.length > 0 && (
              <div className="py-1">
                {predictions.map((p, i) => (
                  <Button
                    key={i}
                    variant="ghost"
                    className="w-full justify-start font-normal h-auto py-2 px-3"
                    onClick={() => handleSelect(p)}
                  >
                     <MapPin className="mr-2 h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                     <div className="flex flex-col items-start truncate overflow-hidden w-full text-left">
                        <span className="truncate w-full font-medium text-sm text-gray-800">
                          {p.properties.name || p.properties.street || 'Local'}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate w-full">
                          {[p.properties.city, p.properties.country].filter(Boolean).join(', ')}
                        </span>
                     </div>
                  </Button>
                ))}
              </div>
            )}
            
            {value.trim().length > 2 && predictions.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-500">
                   Nenhum resultado encontrado.
                </div>
            )}

          </ScrollArea>
        </PopoverContent>
      </Popover>
      {onUseCurrentLocation && (
         <Button variant="outline" size="icon" onClick={onUseCurrentLocation} title="Usar localização atual" className="shrink-0 bg-white">
            <Navigation className="h-4 w-4 text-indigo-600" />
         </Button>
      )}
    </div>
  );
}
