import Image from "next/image";
import { connection } from "next/server";

import { Card, Disclosure, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getOnlineDesigns, getOnlineProducts } from "@/lib/data/online";
import { nextDesignCode } from "@/lib/online/catalogue";
import { designImageUrl } from "@/lib/online/storage";

import { OnlineTabs } from "../OnlineTabs";
import { onlineTabs } from "../tabs";
import {
  AddDesign,
  DeleteDesign,
  DesignForm,
  DesignVisibility,
} from "./DesignForms";

export const metadata = { title: "Jersey designs · Dabz System" };

export default async function OnlineDesignsPage() {
  await connection();
  await requireOwnerOrAdmin();

  const [designs, products] = await Promise.all([
    getOnlineDesigns(true),
    getOnlineProducts(true),
  ]);

  const galleryProducts = products.filter((product) => product.usesDesignGallery);
  const byId = new Map(products.map((product) => [product.id, product]));
  const nextCode = nextDesignCode(designs.map((design) => design.code));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Jersey designs</h1>
        <p className="mt-2 text-muted">
          Layouts you have already drawn, that a customer can pick instead of
          sending their own artwork. You recolour them to the team&rsquo;s
          colours afterwards.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(true)} />

      {galleryProducts.length === 0 ? (
        <Notice tone="attention" title="No product uses the gallery yet">
          <p>
            A design is offered on a product page only when that product has{" "}
            <em>Let customers pick from the jersey design gallery</em> ticked.
            Until one does, designs added here are stored but shown to nobody.
          </p>
        </Notice>
      ) : null}

      {designs.length === 0 ? (
        <Notice tone="info" title="No designs yet">
          <p>
            Nothing was put here for you. Add your own mockups as you draw them
            &mdash; the code (DJ-101, DJ-102) is what a customer will say on
            Messenger, so it is copied onto every order that uses it and stays
            readable even if the design is deleted later.
          </p>
        </Notice>
      ) : null}

      <AddDesign galleryProducts={galleryProducts} nextCode={nextCode} />

      <section className="space-y-4">
        {designs.map((design) => {
          const image = designImageUrl(design.imagePath);
          const usedOn = design.productIds
            .map((id) => byId.get(id)?.name)
            .filter((name): name is string => name !== undefined);

          return (
            <Card key={design.id}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="size-20 shrink-0 overflow-hidden rounded-control bg-tile">
                  {image ? (
                    <Image
                      src={image}
                      alt=""
                      width={160}
                      height={160}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                      No mockup
                    </span>
                  )}
                </div>

                <div className="min-w-48 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {design.code} {design.name}
                    </h2>
                    {design.isVisible ? null : (
                      <Tag tone="attention">{"⚠"} Hidden</Tag>
                    )}
                  </div>
                  {design.description ? (
                    <p className="text-sm text-muted">{design.description}</p>
                  ) : null}
                  <p className="text-sm text-muted">
                    {usedOn.length === 0
                      ? "Not linked to a product, so no customer can pick it"
                      : `Used on ${usedOn.join(", ")}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <DesignVisibility
                    designId={design.id}
                    isVisible={design.isVisible}
                  />
                  <DeleteDesign designId={design.id} code={design.code} />
                </div>
              </div>

              <div className="mt-5">
                <Disclosure label={`Edit ${design.code}`}>
                  <DesignForm
                    design={design}
                    galleryProducts={galleryProducts}
                    nextCode={nextCode}
                  />
                </Disclosure>
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
