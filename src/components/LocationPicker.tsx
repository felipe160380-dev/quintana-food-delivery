import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google: any;
    __qfMapInit?: () => void;
    __qfMapReady?: Promise<void>;
  }
}

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__qfMapReady) return window.__qfMapReady;
  window.__qfMapReady = new Promise<void>((resolve) => {
    window.__qfMapInit = () => resolve();
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const ch = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places&callback=__qfMapInit&channel=${ch}`;
    document.head.appendChild(s);
  });
  return window.__qfMapReady;
}

export type PickedLocation = {
  address_line: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  postal_code?: string;
  neighborhood?: string;
};

function parseAddress(place: any): PickedLocation {
  const c = place.address_components ?? [];
  const get = (t: string) => c.find((x: any) => x.types.includes(t))?.long_name ?? "";
  return {
    address_line: place.formatted_address ?? "",
    latitude: place.geometry.location.lat(),
    longitude: place.geometry.location.lng(),
    city: get("administrative_area_level_2") || get("locality"),
    state: get("administrative_area_level_1"),
    postal_code: get("postal_code"),
    neighborhood: get("sublocality") || get("sublocality_level_1") || get("neighborhood"),
  };
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Digite o endereço",
}: {
  value?: PickedLocation | null;
  onChange: (l: PickedLocation) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const mapObj = useRef<any>(null);
  const markerObj = useRef<any>(null);

  useEffect(() => {
    loadMaps().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !inputRef.current) return;
    const g = window.google;
    const initial = value ? { lat: value.latitude, lng: value.longitude } : { lat: -23.5505, lng: -46.6333 };
    const map = new g.maps.Map(mapRef.current, {
      center: initial,
      zoom: value ? 16 : 12,
      disableDefaultUI: true,
      zoomControl: true,
    });
    mapObj.current = map;
    markerObj.current = new g.maps.Marker({ map, position: initial, draggable: true });

    const ac = new g.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "address_components"],
      componentRestrictions: { country: "br" },
    });
    ac.bindTo("bounds", map);
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      const loc = parseAddress(place);
      map.setCenter({ lat: loc.latitude, lng: loc.longitude });
      map.setZoom(16);
      markerObj.current.setPosition({ lat: loc.latitude, lng: loc.longitude });
      onChange(loc);
    });

    markerObj.current.addListener("dragend", () => {
      const pos = markerObj.current.getPosition();
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ location: { lat: pos.lat(), lng: pos.lng() } }, (res: any[], status: string) => {
        if (status === "OK" && res[0]) {
          const loc = parseAddress(res[0]);
          if (inputRef.current) inputRef.current.value = loc.address_line;
          onChange(loc);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="space-y-2">
      <Input ref={inputRef} placeholder={placeholder} defaultValue={value?.address_line ?? ""} />
      <div ref={mapRef} className="h-56 w-full overflow-hidden rounded-lg border bg-muted" />
      <p className="text-xs text-muted-foreground">Arraste o marcador para ajustar a localização exata.</p>
    </div>
  );
}
