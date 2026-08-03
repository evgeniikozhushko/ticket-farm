import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export function RegistrationPreview() {
    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-6" aria-hidden="true">
            <div className="space-y-2">
              <Label htmlFor="preview-name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="preview-name"
                type="text"
                placeholder="Enter your name"
                className="h-12 text-base"
                disabled
              />
            </div>
   
            <div className="space-y-2">
              <Label htmlFor="preview-email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="preview-email"
                type="email"
                placeholder="your.email@example.com"
                className="h-12 text-base"
                disabled
              />
            </div>
   
            <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-4">
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
              className="h-14 w-full text-lg font-semibold border"
            //   disabled
            >
              Get today ticket
            </Button>
          </div>
        </div>
      );
}