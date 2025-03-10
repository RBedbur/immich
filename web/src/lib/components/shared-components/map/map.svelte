<script lang="ts" module>
  if (!maplibregl.getRTLTextPluginStatus()) {
    void maplibregl.setRTLTextPlugin(mapboxRtlUrl, true);
  }
</script>

<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import { Theme } from '$lib/constants';
  import type { MapBounds } from '$lib/models/map';
  import { colorTheme, mapSettings } from '$lib/stores/preferences.store';
  import { serverConfig } from '$lib/stores/server-config.store';
  import { getAssetThumbnailUrl, handlePromiseError } from '$lib/utils';
  import { type MapMarkerResponseDto } from '@immich/sdk';
  import mapboxRtlUrl from '@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.min.js?url';
  import { mdiCog, mdiMap, mdiMapMarker } from '@mdi/js';
  import type { Feature, GeoJsonProperties, Geometry, Point } from 'geojson';
  import type { GeoJSONSource, LngLatLike, LngLatBounds } from 'maplibre-gl';
  import maplibregl from 'maplibre-gl';
  import { t } from 'svelte-i18n';
  import {
    AttributionControl,
    Control,
    ControlButton,
    ControlGroup,
    FullscreenControl,
    GeoJSON,
    GeolocateControl,
    MapLibre,
    MarkerLayer,
    NavigationControl,
    Popup,
    ScaleControl,
    type Map,
  } from 'svelte-maplibre';

  interface Props {
    mapMarkers: MapMarkerResponseDto[];
    showSettingsModal?: boolean | undefined;
    zoom?: number | undefined;
    center?: LngLatLike | undefined;
    hash?: boolean;
    simplified?: boolean;
    clickable?: boolean;
    useLocationPin?: boolean;
    mapContainer?: HTMLElement;
    onOpenInMapView?: (() => Promise<void> | void) | undefined;
    onSelect?: (assetIds: string[]) => void;
    onClickPoint?: ({ lat, lng }: { lat: number; lng: number }) => void;
    popup?: import('svelte').Snippet<[{ marker: MapMarkerResponseDto }]>;
    onChangeBounds?: (bounds: MapBounds) => void;
  }

  let {
    mapMarkers = $bindable(),
    showSettingsModal = $bindable(undefined),
    zoom = undefined,
    center = $bindable(undefined),
    hash = false,
    simplified = false,
    clickable = false,
    useLocationPin = false,
    mapContainer = $bindable(undefined),
    onOpenInMapView = undefined,
    onSelect = () => {},
    onClickPoint = () => {},
    popup,
    onChangeBounds,
  }: Props = $props();

  let map: maplibregl.Map | undefined = $state();
  let marker: maplibregl.Marker | null = null;

  const theme = $derived($mapSettings.allowDarkMode ? $colorTheme.value : Theme.LIGHT);
  const styleUrl = $derived(theme === Theme.DARK ? $serverConfig.mapDarkStyleUrl : $serverConfig.mapLightStyleUrl);
  const style = $derived(fetch(styleUrl).then((response) => response.json()));

  let isAssetGridOpened: boolean = $state(true);

  const changeBounds = () => {
    if (isAssetGridOpened && map && onChangeBounds) {
      const bounds = map.getBounds();
      const normalizedBounds = getNormalizedBounds(bounds);
      onChangeBounds(normalizedBounds);
    }
  };

  /*
  /* Normalizing longitude bounds:
  /* This correction is necessary because 
  /* - MapLibre GL allows users to pan the map continuously in the longitude direction
  /*   (i.e., the map can be panned to the left indefinitely, and the same for the right).
  /* - part of the map is over dateline
  /* which can result in longitude coordinates outside the standard -180° to 180° range.
  */
  function getNormalizedBounds(bounds: LngLatBounds): MapBounds {
    let boundWest = undefined,
      boundEast = undefined,
      boundSouth = undefined,
      boundNorth = undefined;

    if (Math.abs(bounds.getWest()) + Math.abs(bounds.getEast()) > 360) {
      // World Wrap: If the total span between bounds exceeds 360°, it means the view wraps around the entire world.
      // In this case, we set the bounds to cover the entire longitude range (-180° to 180°).
      boundWest = -180;
      boundEast = 180;
      // } else if (Math.abs(bounds.getWest()) > 180) {
    } else if (bounds.getWest() < -180) {
      // West Out of Bounds: If the west bound is beyond -180°,
      // we normalize it by adding 360° to bring it into the valid range.
      boundWest = bounds.getWest() + 360;
      boundEast = bounds.getEast();
      // } else if (Math.abs(bounds.getEast()) > 180) {
    } else if (bounds.getEast() > 180) {
      // East Out of Bounds: If the east bound is beyond +180°,
      // we normalize it by subtracting 360° to bring it into the valid range.
      boundWest = bounds.getWest();
      boundEast = bounds.getEast() - 360;
    } else {
      // Normal Case: If both bounds are within the valid range, we use them as-is.
      boundWest = bounds.getWest();
      boundEast = bounds.getEast();
    }

    boundNorth = bounds.getNorth();
    boundSouth = bounds.getSouth();

    return { boundWest, boundEast, boundSouth, boundNorth };
  }

  export function addClipMapMarker(lng: number, lat: number) {
    if (map) {
      if (marker) {
        marker.remove();
      }

      center = { lng, lat };
      marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
    }
  }

  function handleAssetClick(assetId: string, map: Map | null) {
    if (!map) {
      return;
    }
    onSelect([assetId]);
  }

  async function handleClusterClick(clusterId: number, map: Map | null) {
    if (!map) {
      return;
    }

    const mapSource = map?.getSource('geojson') as GeoJSONSource;
    const leaves = await mapSource.getClusterLeaves(clusterId, 10_000, 0);
    const ids = leaves.map((leaf) => leaf.properties?.id);
    onSelect(ids);
  }

  function handleMapClick(event: maplibregl.MapMouseEvent) {
    if (clickable) {
      const { lng, lat } = event.lngLat;
      onClickPoint({ lng, lat });

      if (marker) {
        marker.remove();
      }

      if (map) {
        marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
      }
    }
  }

  type FeaturePoint = Feature<Point, { id: string; city: string | null; state: string | null; country: string | null }>;

  const asFeature = (marker: MapMarkerResponseDto): FeaturePoint => {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [marker.lon, marker.lat] },
      properties: {
        id: marker.id,
        city: marker.city,
        state: marker.state,
        country: marker.country,
      },
    };
  };

  const asMarker = (feature: Feature<Geometry, GeoJsonProperties>): MapMarkerResponseDto => {
    const featurePoint = feature as FeaturePoint;
    const coords = maplibregl.LngLat.convert(featurePoint.geometry.coordinates as [number, number]);
    return {
      lat: coords.lat,
      lon: coords.lng,
      id: featurePoint.properties.id,
      city: featurePoint.properties.city,
      state: featurePoint.properties.state,
      country: featurePoint.properties.country,
    };
  };
</script>

{#await style then style}
  <MapLibre
    {hash}
    {style}
    class={`relative w-full overflow-hidden transition ease-in-out h-full ${isAssetGridOpened ? 'h-1/2' : 'h-full'}`}
    {center}
    {zoom}
    attributionControl={false}
    diffStyleUpdates={true}
    on:load={(event) => event.detail.setMaxZoom(18)}
    on:load={(event) => event.detail.on('click', handleMapClick)}
    bind:map
    on:moveend={changeBounds}
  >
    {#snippet children({ map }: { map: maplibregl.Map })}
      <NavigationControl position="top-left" showCompass={!simplified} />

      {#if !simplified}
        <GeolocateControl position="top-left" />
        <FullscreenControl position="top-left" container={mapContainer} />
        <ScaleControl />
        <AttributionControl compact={false} />
      {/if}

      {#if showSettingsModal !== undefined}
        <Control>
          <ControlGroup>
            <ControlButton on:click={() => (showSettingsModal = true)}><Icon path={mdiCog} size="100%" /></ControlButton
            >
          </ControlGroup>
        </Control>
      {/if}

      {#if onOpenInMapView}
        <Control position="top-right">
          <ControlGroup>
            <ControlButton on:click={() => onOpenInMapView()}>
              <Icon title={$t('open_in_map_view')} path={mdiMap} size="100%" />
            </ControlButton>
          </ControlGroup>
        </Control>
      {/if}

      <GeoJSON
        data={{
          type: 'FeatureCollection',
          features: mapMarkers.map((marker) => asFeature(marker)),
        }}
        id="geojson"
        cluster={{ radius: 500, maxZoom: 24 }}
      >
        <MarkerLayer
          applyToClusters
          asButton
          on:click={(event) => handlePromiseError(handleClusterClick(event.detail.feature.properties?.cluster_id, map))}
        >
          {#snippet children({ feature }: { feature: maplibregl.Feature })}
            <div
              class="rounded-full w-[40px] h-[40px] bg-immich-primary text-immich-gray flex justify-center items-center font-mono font-bold shadow-lg hover:bg-immich-dark-primary transition-all duration-200 hover:text-immich-dark-bg opacity-90"
            >
              {feature.properties?.point_count}
            </div>
          {/snippet}
        </MarkerLayer>
        <MarkerLayer
          applyToClusters={false}
          asButton
          on:click={(event) => {
            if (!popup) {
              handleAssetClick(event.detail.feature.properties?.id, map);
            }
          }}
        >
          {#snippet children({ feature }: { feature: Feature<Geometry, GeoJsonProperties> })}
            {#if useLocationPin}
              <Icon
                path={mdiMapMarker}
                size="50px"
                class="location-pin dark:text-immich-dark-primary text-immich-primary"
              />
            {:else}
              <img
                src={getAssetThumbnailUrl(feature.properties?.id)}
                class="rounded-full w-[60px] h-[60px] border-2 border-immich-primary shadow-lg hover:border-immich-dark-primary transition-all duration-200 hover:scale-150 object-cover bg-immich-primary"
                alt={feature.properties?.city && feature.properties.country
                  ? $t('map_marker_for_images', {
                      values: { city: feature.properties.city, country: feature.properties.country },
                    })
                  : $t('map_marker_with_image')}
              />
            {/if}
            {#if popup}
              <Popup offset={[0, -30]} openOn="click" closeOnClickOutside>
                {@render popup?.({ marker: asMarker(feature) })}
              </Popup>
            {/if}
          {/snippet}
        </MarkerLayer>
      </GeoJSON>
    {/snippet}
  </MapLibre>

  <style>
    .location-pin {
      transform: translate(0, -50%);
      filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.3));
    }
  </style>
{/await}
