import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MapPin, CalendarDays, Clock, Check, Truck } from "lucide-react";

const DELIVERY_DAYS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
];

const DEFAULT_TIME_SLOTS = [
  { value: "10am-12pm", label: "10:00 AM – 12:00 PM" },
  { value: "12pm-2pm", label: "12:00 PM – 2:00 PM" },
  { value: "2pm-4pm", label: "2:00 PM – 4:00 PM" },
  { value: "4pm-6pm", label: "4:00 PM – 6:00 PM" },
];

interface DeliverySchedulerProps {
  timeSlots?: Array<{ value: string; label: string }>;
  onSchedule?: (data: {
    address: string;
    city: string;
    zip: string;
    day: string;
    timeSlot: string;
  }) => void;
}

export function DeliveryScheduler({
  timeSlots = DEFAULT_TIME_SLOTS,
  onSchedule,
}: DeliverySchedulerProps) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);

  const isComplete = address.trim() && city.trim() && zip.trim() && selectedDay && selectedSlot;

  const handleSchedule = () => {
    if (!isComplete) return;
    setIsScheduled(true);
    onSchedule?.({ address, city, zip, day: selectedDay, timeSlot: selectedSlot });
  };

  const handleReset = () => {
    setIsScheduled(false);
    setAddress("");
    setCity("");
    setZip("");
    setSelectedDay("");
    setSelectedSlot("");
  };

  if (isScheduled) {
    const dayLabel = DELIVERY_DAYS.find(d => d.value === selectedDay)?.label;
    const slotLabel = timeSlots.find(s => s.value === selectedSlot)?.label;

    return (
      <section className="py-12 md:py-16">
        <div className="container max-w-2xl">
          <Card className="border-primary/20 bg-primary/5 shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-foreground">Delivery Scheduled!</h3>
              <p className="mt-2 text-muted-foreground">
                {address}, {city} {zip}
              </p>
              <p className="mt-1 font-semibold text-primary">
                {dayLabel} · {slotLabel}
              </p>
              <Button variant="outline" className="mt-6" onClick={handleReset}>
                Change delivery details
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
            <Truck className="h-4 w-4" />
            Schedule Your Delivery
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
            Choose Your Delivery Window
          </h2>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            We deliver on Mondays and Tuesdays. Pick a day and time that works best for you.
          </p>
        </div>

        <Card className="shadow-lg border-border/60">
          <CardContent className="p-6 md:p-8 space-y-8">
            {/* Step 1 — Address */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                  1
                </div>
                <h3 className="font-serif text-lg font-bold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-accent" />
                  Delivery Address
                </h3>
              </div>
              <div className="space-y-3 pl-9">
                <div>
                  <Label htmlFor="address" className="text-sm">Street Address</Label>
                  <Input
                    id="address"
                    placeholder="123 Main Street, Apt 4B"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="city" className="text-sm">City</Label>
                    <Input
                      id="city"
                      placeholder="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip" className="text-sm">ZIP Code</Label>
                    <Input
                      id="zip"
                      placeholder="10001"
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 — Day */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                  2
                </div>
                <h3 className="font-serif text-lg font-bold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-accent" />
                  Delivery Day
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-9">
                {DELIVERY_DAYS.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => setSelectedDay(day.value)}
                    className={`p-4 rounded-xl border-2 text-center font-semibold transition-all ${
                      selectedDay === day.value
                        ? "border-primary bg-primary/5 text-primary shadow-sm"
                        : "border-border hover:border-primary/40 text-foreground"
                    }`}
                  >
                    <CalendarDays className={`h-5 w-5 mx-auto mb-1.5 ${selectedDay === day.value ? "text-primary" : "text-muted-foreground"}`} />
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3 — Time slot */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                  3
                </div>
                <h3 className="font-serif text-lg font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" />
                  Time Window
                </h3>
              </div>
              <RadioGroup
                value={selectedSlot}
                onValueChange={setSelectedSlot}
                className="pl-9 space-y-2"
              >
                {timeSlots.map((slot) => (
                  <label
                    key={slot.value}
                    htmlFor={`slot-${slot.value}`}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedSlot === slot.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <RadioGroupItem value={slot.value} id={`slot-${slot.value}`} />
                    <Clock className={`h-4 w-4 ${selectedSlot === slot.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium">{slot.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Schedule button */}
            <Button
              onClick={handleSchedule}
              disabled={!isComplete}
              className="w-full rounded-full bg-primary hover:bg-primary/90 shadow-md"
              size="lg"
            >
              <Truck className="mr-2 h-5 w-5" />
              Schedule Delivery
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
