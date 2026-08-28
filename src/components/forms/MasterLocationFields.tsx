"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { Button } from "@/components/ui/Button";
import { useLocationCatalog } from "@/hooks/useLocationCatalog";
import type { LocationCatalogItem } from "@/modules/master-data/types";

function composeLocation(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

function filterByFacility(
  items: LocationCatalogItem[],
  facilityId: string | undefined
) {
  if (!facilityId) return [];
  return items.filter((item) => item.facilityId === facilityId);
}

function filterByBuilding(
  items: LocationCatalogItem[],
  facilityId: string | undefined,
  buildingId: string | undefined
) {
  if (!facilityId || !buildingId) return [];
  return items.filter(
    (item) =>
      item.facilityId === facilityId && item.buildingId === buildingId
  );
}

function filterByFloor(
  items: LocationCatalogItem[],
  facilityId: string | undefined,
  buildingId: string | undefined,
  floorId: string | undefined
) {
  if (!facilityId || !buildingId || !floorId) return [];
  return items.filter(
    (item) =>
      item.facilityId === facilityId &&
      item.buildingId === buildingId &&
      item.floorId === floorId
  );
}

/**
 * Cascading Facility → Building → Floor → Room from one location catalog load.
 * Each level filters in memory — no per-level Apps Script requests.
 */
export function MasterLocationFields({
  facilityId,
  onFacilityChange,
  value,
  onChange,
  disabled,
  required,
  error,
  facilityError,
  label = "Location",
  hint = "Select facility, then building, floor, and room.",
  includeFacility = true,
}: {
  facilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  facilityError?: string;
  label?: string;
  hint?: string;
  /** When false, facility is controlled outside this component. */
  includeFacility?: boolean;
}) {
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [detail, setDetail] = useState("");
  const [initialized, setInitialized] = useState(false);

  const {
    catalog,
    loading: catalogLoading,
    error: catalogError,
    reload,
  } = useLocationCatalog(!disabled);

  const facilities = catalog.facilities;
  const buildings = useMemo(
    () => filterByFacility(catalog.buildings, facilityId),
    [catalog.buildings, facilityId]
  );
  const floors = useMemo(
    () => filterByBuilding(catalog.floors, facilityId, buildingId),
    [catalog.floors, facilityId, buildingId]
  );
  const rooms = useMemo(
    () => filterByFloor(catalog.rooms, facilityId, buildingId, floorId),
    [catalog.rooms, facilityId, buildingId, floorId]
  );

  useEffect(() => {
    if (initialized) return;
    setDetail(value);
    setInitialized(true);
  }, [value, initialized]);

  useEffect(() => {
    setBuildingId("");
    setFloorId("");
    setRoomId("");
  }, [facilityId]);

  function emit(
    nextBuildingId: string,
    nextFloorId: string,
    nextRoomId: string,
    nextDetail: string
  ) {
    const building = buildings.find((item) => item.id === nextBuildingId)?.name;
    const floor = floors.find((item) => item.id === nextFloorId)?.name;
    const room = rooms.find((item) => item.id === nextRoomId)?.name;
    onChange(composeLocation([building, floor, room, nextDetail]));
  }

  const catalogFailed = Boolean(catalogError);
  const catalogEmpty =
    !catalogLoading && !catalogFailed && facilities.length === 0;
  const facilityDisabled =
    disabled ||
    catalogLoading ||
    catalogFailed ||
    (includeFacility && catalogEmpty);
  const buildingDisabled =
    disabled || catalogLoading || catalogFailed || !facilityId;
  const floorDisabled =
    disabled || catalogLoading || catalogFailed || !buildingId;
  const roomDisabled =
    disabled || catalogLoading || catalogFailed || !floorId;

  function facilityPlaceholder() {
    if (catalogLoading) return "Loading locations…";
    if (catalogFailed) return "Unable to load locations.";
    if (catalogEmpty) return "No facilities are currently available.";
    return "Select facility";
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        {catalogFailed ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-danger">Unable to load locations.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled || catalogLoading}
              onClick={reload}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {catalogEmpty ? (
          <p className="mt-2 text-xs text-muted">
            No facilities are currently available.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {includeFacility ? (
          <FormField
            label="Facility"
            htmlFor="master-location-facility"
            required={required}
            error={facilityError}
          >
            <select
              id="master-location-facility"
              className={selectClassName}
              value={facilityId ?? ""}
              disabled={facilityDisabled}
              onChange={(event) => {
                const next = event.target.value;
                onFacilityChange?.(next);
                setBuildingId("");
                setFloorId("");
                setRoomId("");
                emit("", "", "", detail);
              }}
            >
              <option value="">{facilityPlaceholder()}</option>
              {facilityId &&
              !facilities.some((item) => item.id === facilityId) ? (
                <option value={facilityId}>{facilityId}</option>
              ) : null}
              {facilities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        <FormField label="Building" htmlFor="master-location-building">
          <select
            id="master-location-building"
            className={selectClassName}
            value={buildingId}
            disabled={buildingDisabled}
            aria-label="Building"
            onChange={(event) => {
              const next = event.target.value;
              setBuildingId(next);
              setFloorId("");
              setRoomId("");
              emit(next, "", "", detail);
            }}
          >
            <option value="">
              {!facilityId
                ? "Select facility first"
                : catalogLoading
                  ? "Loading locations…"
                  : "Select building"}
            </option>
            {buildings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Floor" htmlFor="master-location-floor">
          <select
            id="master-location-floor"
            className={selectClassName}
            value={floorId}
            disabled={floorDisabled}
            aria-label="Floor"
            onChange={(event) => {
              const next = event.target.value;
              setFloorId(next);
              setRoomId("");
              emit(buildingId, next, "", detail);
            }}
          >
            <option value="">
              {!buildingId
                ? "Select building first"
                : catalogLoading
                  ? "Loading locations…"
                  : "Select floor"}
            </option>
            {floors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Room" htmlFor="master-location-room">
          <select
            id="master-location-room"
            className={selectClassName}
            value={roomId}
            disabled={roomDisabled}
            aria-label="Room"
            onChange={(event) => {
              const next = event.target.value;
              setRoomId(next);
              emit(buildingId, floorId, next, detail);
            }}
          >
            <option value="">
              {!floorId
                ? "Select floor first"
                : catalogLoading
                  ? "Loading locations…"
                  : "Select room"}
            </option>
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField
        label="Additional location detail"
        htmlFor="master-location-detail"
        hint="Optional notes (e.g. near east stairwell)."
      >
        <input
          id="master-location-detail"
          className={inputClassName}
          value={detail}
          disabled={disabled}
          placeholder="e.g. near east stairwell"
          onChange={(event) => {
            const next = event.target.value;
            setDetail(next);
            emit(buildingId, floorId, roomId, next);
          }}
        />
      </FormField>
    </div>
  );
}
