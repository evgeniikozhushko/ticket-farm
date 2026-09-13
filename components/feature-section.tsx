import Image from "next/image";
import type { ReactNode } from "react";

type FeatureSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  preview?: ReactNode;
  previewClassName?: string;
  reverse?: boolean;
};

function FeatureSection({
  eyebrow,
  title,
  description,
  image,
  imageAlt,
  preview,
  previewClassName,
  reverse = false,
}: FeatureSectionProps) {
  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 py-12 sm:py-16 md:min-h-[680px] md:grid-cols-2 md:gap-20 md:py-24">
        <div className={reverse ? "md:order-2" : ""}>
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            {eyebrow}
          </p>

          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h2>

          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8">
            {description}
          </p>
        </div>

        <div className={`min-w-0 ${reverse ? "md:order-1" : ""}`}>
          {preview ? (
            <div
              className={`relative aspect-[4/3] min-h-0 overflow-hidden ${previewClassName ?? ""}`}
            >
              {preview}
            </div>
          ) : (
            <div className="relative aspect-[4/3] min-h-0 overflow-hidden">
              <Image
                src={image ?? ""}
                alt={imageAlt ?? ""}
                fill
                className="object-cover object-top"
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default FeatureSection;
