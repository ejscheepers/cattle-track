import { Nav } from "@/components/nav";
import siteData from "@/config/siteData.json";
import { auth } from "@/lib/auth";
import { generateMeta } from "@forge42/seo-tools/remix/metadata";
import { organization } from "@forge42/seo-tools/structured-data/organization";
import type { MetaFunction } from "react-router";
import type { Route } from "./+types/_index";
import { Button } from "@/components/ui/button";

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
    <>
      <Nav isLoggedIn={isLoggedIn} />
      <div className="flex min-h-full flex-1 flex-col sm:px-6 lg:px-8 pt-6 space-y-6 px-3">
        <h1 className="text-4xl font-bold mb-8">What to do</h1>
        <div className="grid grid-cols-1 justify-center">
          <div className="bg-white shadow-lg rounded-lg p-6 flex flex-col items-center mx-auto">
            <h2 className="text-2xl font-semibold mb-4">Track Cattle</h2>
            <p className="mb-6 text-center">
              Monitor and manage your existing cattle with detailed tracking
              tools.
            </p>
            <a href="/track-cattle" className="inline-block">
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                Track Cattle
              </Button>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
