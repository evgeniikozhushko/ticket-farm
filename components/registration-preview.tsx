import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export function RegistrationPreview() {
  return (
    <div className="w-full rounded-xl border bg-card p-4 shadow-sm sm:p-6 xl:h-full xl:p-4">
      <div
        className="flex h-full flex-col justify-center gap-4 sm:gap-5"
        aria-hidden="true"
      >
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="preview-name" className="text-sm font-medium">
            Name
          </Label>
          <Input
            id="preview-name"
            type="text"
            placeholder="Enter your name"
            className="h-10 text-base sm:h-11"
            disabled
          />
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="preview-email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="preview-email"
            type="email"
            placeholder="your.email@example.com"
            className="h-10 text-base sm:h-11"
            disabled
          />
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3 sm:p-4">
          <Checkbox id="preview-consent" className="mt-0.5" disabled />
          <label
            htmlFor="preview-consent"
            className="text-sm leading-relaxed text-foreground"
          >
            I understand this is a lottery and not everyone will be selected.
          </label>
        </div>

        <Button
          type="button"
          size="lg"
          className="h-11 w-full border text-base font-semibold sm:h-12 lg:text-lg"
        >
          Get today&apos;s ticket
        </Button>
      </div>
    </div>
  );
}
