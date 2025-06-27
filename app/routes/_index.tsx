import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import siteData from "@/config/siteData.json";
import { auth } from "@/lib/auth";
import { generateMeta } from "@forge42/seo-tools/remix/metadata";
import { organization } from "@forge42/seo-tools/structured-data/organization";
import type { MetaFunction } from "react-router";
import type { Route } from "./+types/_index";

export const meta: MetaFunction = () => {
  // This utility will under the hood generate the twitter & og title and description tags for you.
  const meta = generateMeta(
    {
      title: siteData.title,
      description: siteData.description,
      url: siteData.url,
    },
    [
      {
        "script:ld+json": organization({
          "@type": "Organization",
          name: siteData.name,
          description: siteData.description,
          url: siteData.url,
        }),
      },
    ]
  );

  return meta;
};

export async function loader({ request }: Route.LoaderArgs) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });

  return { isLoggedIn: !!session };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { isLoggedIn } = loaderData;
  return (
    <main className="flex-1">
      <section className="w-full min-h-screen flex flex-col justify-center py-6 md:py-12 lg:py-24 xl:py-24 bg-gradient-to-b from-green-50 to-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  Simple Cattle Management
                </Badge>
                <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                  Track Your Cattle Information
                </h1>
                <p className="max-w-[600px] text-gray-500 md:text-xl">
                  Keep detailed records of your cattle herd. Track health,
                  breeding, weights, and important notes for each animal in one
                  simple system.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <a href="/track-cattle">
                  <Button
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Get Started
                  </Button>
                </a>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <img
                src="/cattle-track-logo.png"
                width="600"
                height="auto"
                alt="Cattle records and information tracking interface"
                className="mx-auto  overflow-hidden rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
