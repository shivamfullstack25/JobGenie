import {useState} from "react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Check, ChevronsUpDown, Globe, MapPin, X} from "lucide-react";
import {getPopularLocations, globalLocations, type LocationData, searchLocations} from "@/data/globalLocations";

interface LocationSearchProps {
  selectedLocations: string[];
  onLocationAdd: (location: string) => void;
  onLocationRemove: (location: string) => void;
  onCurrencyChange?: (currency: string, symbol: string) => void;
  placeholder?: string;
  maxLocations?: number;
}

export default function LocationSearch({
  selectedLocations,
  onLocationAdd,
  onLocationRemove,
  onCurrencyChange,
  placeholder = "Search cities worldwide...",
  maxLocations = 5
}: LocationSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredLocations = searchLocations(searchValue).filter(location => 
    !selectedLocations.includes(location.name)
  );

  const popularLocations = getPopularLocations().filter(location => 
    !selectedLocations.includes(location.name)
  );

  const handleLocationSelect = (location: LocationData) => {
    if (selectedLocations.length < maxLocations) {
      onLocationAdd(location.name);
      
      // Auto-update currency based on location
      if (onCurrencyChange) {
        onCurrencyChange(location.currency, location.currencySymbol);
      }
      
      setSearchValue("");
      setOpen(false);
    }
  };

  const formatLocationDisplay = (location: LocationData) => {
    return location.country === "Global" 
      ? location.name 
      : `${location.name}, ${location.country}`;
  };

  const getLocationData = (locationName: string): LocationData | undefined => {
    return globalLocations.find(loc => loc.name === locationName);
  };

  return (
    <div className="space-y-3">
      <div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between text-left font-normal"
              disabled={selectedLocations.length >= maxLocations}
            >
              <div className="flex items-center">
                <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
                {selectedLocations.length === 0 ? (
                  <span className="text-muted-foreground">{placeholder}</span>
                ) : (
                  <span>{selectedLocations.length} location{selectedLocations.length > 1 ? 's' : ''} selected</span>
                )}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <CommandInput 
                placeholder="Search cities, countries, or regions..." 
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList>
                <CommandEmpty>No locations found.</CommandEmpty>
                
                {!searchValue && popularLocations.length > 0 && (
                  <CommandGroup heading="Popular Tech Hubs">
                    {popularLocations.slice(0, 8).map((location) => (
                      <CommandItem
                        key={location.name}
                        onSelect={() => handleLocationSelect(location)}
                        className="cursor-pointer"
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        <div className="flex-1">
                          <span className="font-medium">{location.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {location.country} • {location.currencySymbol} {location.currency}
                          </span>
                        </div>
                        <Check className="ml-auto h-4 w-4 opacity-0" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {filteredLocations.length > 0 && (
                  <CommandGroup heading={searchValue ? "Search Results" : "All Locations"}>
                    {filteredLocations.map((location) => (
                      <CommandItem
                        key={`${location.name}-${location.country}`}
                        onSelect={() => handleLocationSelect(location)}
                        className="cursor-pointer"
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        <div className="flex-1">
                          <span className="font-medium">{location.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {location.country} • {location.region} • {location.currencySymbol} {location.currency}
                          </span>
                        </div>
                        <Check className="ml-auto h-4 w-4 opacity-0" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      
      {selectedLocations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedLocations.map((locationName) => {
            const locationData = getLocationData(locationName);
            return (
              <Badge key={locationName} variant="secondary" className="pr-1">
                <MapPin className="mr-1 h-3 w-3" />
                {locationData ? formatLocationDisplay(locationData) : locationName}
                <button
                  onClick={() => onLocationRemove(locationName)}
                  className="ml-2 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {locationName}</span>
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      
      {selectedLocations.length >= maxLocations && (
        <p className="text-sm text-muted-foreground">
          Maximum {maxLocations} locations allowed
        </p>
      )}
    </div>
  );
}