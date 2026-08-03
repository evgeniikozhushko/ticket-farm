import Image from "next/image";
import type { ReactNode } from "react";

type FeatureSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  preview?: ReactNode;
  reverse?: boolean;
};

function FeatureSection({
  eyebrow,
  title,
  description,
  image,
  imageAlt,
  preview,
  reverse = false,
}: FeatureSectionProps) {
  return (
    <section className="px-6">
      <div className="mx-auto grid min-h-[680px] w-full max-w-6xl items-center gap-12 py-24 md:grid-cols-2 md:gap-20">
        <div className={reverse ? "md:order-2" : ""}>
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            {eyebrow}
          </p>

          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h2>

          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className={reverse ? "md:order-1" : ""}>
          {preview ? (
            <div className="relative aspect-[4/3] overflow-hidden bg-muted/30">
              {preview}
            </div>
          ) : (
            <div className="relative aspect-[4/3] overflow-hidden bg-muted/30">
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