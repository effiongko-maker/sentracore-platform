"use client";

import { useEffect, useState } from "react";
import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/forms/FormField";
import { MasterDataSelect } from "@/components/forms/MasterDataSelect";
import { useFacilityOptions } from "@/hooks/useFacilityOptions";
import { useMasterDataOptions } from "@/hooks/useMasterDataOptions";

function composeLocation(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

/**
 * Cascading Facility → Building → Floor → Room from Master Data / Facilities.
 * Each level enables the next. Empty options are "Select …", never the level name alone.
 * Composes a display string into the existing free-text location field.
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

  const { facilities, loading: facilitiesLoading } = useFacilityOptions(
    includeFacility && !disabled
  );

  const { items: buildings } = useMasterDataOptions("buildings", {
    facilityId: facilityId || undefined,
    enabled: Boolean(facilityId),
  });
  const { items: floors } = useMasterDataOptions("floors", {
    facilityId: facilityId || undefined,
    buildingId: buildingId || undefined,
    enabled: Boolean(facilityId && buildingId),
  });
  const { items: rooms } = useMasterDataOptions("rooms", {
    facilityId: facilityId || undefined,
    buildingId: buildingId || undefined,
    floorId: floorId || undefined,
    enabled: Boolean(facilityId && buildingId && floorId),
  });

  useEffect(() => {
    if (initialized) return;
    // Preserve legacy free-text in the detail field until the user rebuilds via cascade.
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

  return (
    <div className="space-y-4 sm:col-span-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
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
              disabled={disabled || facilitiesLoading}
              onChange={(event) => {
                const next = event.target.value;
                onFacilityChange?.(next);
                setBuildingId("");
                setFloorId("");
                setRoomId("");
                emit("", "", "", detail);
              }}
            >
              <option value="">
                {facilitiesLoading ? "Loading facilities…" : "Select facility"}
              </option>
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
          <MasterDataSelect
            id="master-location-building"
            entity="buildings"
            value={buildingId}
            facilityId={facilityId || undefined}
            enabled={Boolean(facilityId)}
            disabled={disabled || !facilityId}
            emptyOptionLabel={
              !facilityId ? "Select facility first" : "Select building"
            }
            loadingPlaceholder="Loading…"
            aria-label="Building"
            onChange={(next) => {
              setBuildingId(next);
              setFloorId("");
              setRoomId("");
              emit(next, "", "", detail);
            }}
          />
        </FormField>

        <FormField label="Floor" htmlFor="master-location-floor">
          <MasterDataSelect
            id="master-location-floor"
            entity="floors"
            value={floorId}
            facilityId={facilityId || undefined}
            buildingId={buildingId || undefined}
            enabled={Boolean(facilityId && buildingId)}
            disabled={disabled || !buildingId}
            emptyOptionLabel={
              !buildingId ? "Select building first" : "Select floor"
            }
            loadingPlaceholder="Loading…"
            aria-label="Floor"
            onChange={(next) => {
              setFloorId(next);
              setRoomId("");
              emit(buildingId, next, "", detail);
            }}
          />
        </FormField>

        <FormField label="Room" htmlFor="master-location-room">
          <MasterDataSelect
            id="master-location-room"
            entity="rooms"
            value={roomId}
            facilityId={facilityId || undefined}
            buildingId={buildingId || undefined}
            floorId={floorId || undefined}
            enabled={Boolean(facilityId && buildingId && floorId)}
            disabled={disabled || !floorId}
            emptyOptionLabel={!floorId ? "Select floor first" : "Select room"}
            loadingPlaceholder="Loading…"
            aria-label="Room"
            onChange={(next) => {
              setRoomId(next);
              emit(buildingId, floorId, next, detail);
            }}
          />
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
