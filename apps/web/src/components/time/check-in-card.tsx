"use client";

import { useActionState, useRef, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { checkInOut, type AttendanceFormState } from "@/app/dashboard/time/attendance/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CheckInCard({ lastEventType }: { lastEventType: string | null }) {
  const [state, action, pending] = useActionState<AttendanceFormState, FormData>(
    checkInOut,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const nextAction = lastEventType === "check_in" ? "Check out" : "Check in";

  function locateAndSubmit() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      // No geolocation support — submit without coordinates.
      formRef.current?.requestSubmit();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: position.coords.accuracy,
        });
        setLocating(false);
        // Submit on the next tick so the hidden inputs carry the new values.
        setTimeout(() => formRef.current?.requestSubmit(), 0);
      },
      (error) => {
        setLocating(false);
        setGeoError(
          `Location unavailable (${error.message}). You can still record without location.`,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Mobile check-in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.message && (
          <Alert>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {geoError && (
          <Alert variant="destructive">
            <AlertDescription>{geoError}</AlertDescription>
          </Alert>
        )}
        <form action={action} className="flex flex-wrap items-center gap-3" ref={formRef}>
          <input name="latitude" type="hidden" value={coords?.lat ?? ""} />
          <input name="longitude" type="hidden" value={coords?.lng ?? ""} />
          <input name="accuracy" type="hidden" value={coords?.acc ?? ""} />
          <Button
            disabled={pending || locating}
            onClick={locateAndSubmit}
            size="lg"
            type="button"
          >
            <MapPinIcon />
            {locating ? "Locating…" : pending ? "Recording…" : nextAction}
          </Button>
          {geoError && (
            <Button disabled={pending} size="sm" type="submit" variant="outline">
              Record without location
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Your position is checked against the company&apos;s geofenced work sites.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
