import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { auth } from "@/lib/auth";
import { cattle, treatment } from "@/models/schema.server";
import { db } from "@/utils/db.server";
import { eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/track-cattle.treatment-view.$tag";

export async function loader({ request, params }: Route.LoaderArgs) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw redirect("/login");
  }
  let tag = params.tag;
  let cattleData = await db
    .select()
    .from(cattle)
    .where(eq(cattle.tag_number, tag));
  if (!cattleData[0]) {
    throw redirect("/track-cattle");
  }
  // Fetch all treatments for this cattle
  const treatments = await db
    .select()
    .from(treatment)
    .where(eq(treatment.cattleId, cattleData[0].id));
  return { cattleData: cattleData[0], treatments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const id = String(formData.get("id") || "");
  if (!id) {
    return { error: "Missing treatment id." };
  }
  await db
    .update(treatment)
    .set({ completed: true })
    .where(eq(treatment.id, id));
  return null;
}

export default function ViewTreatmentsByTag() {
  const { cattleData, treatments } = useLoaderData<typeof loader>();
  const [viewOpen, setViewOpen] = useState(true);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const success = useActionData<typeof action>();

  useEffect(() => {
    if (!viewOpen || success) {
      navigate("..", { preventScrollReset: true });
    }
  }, [viewOpen, success]);

  // Split treatments
  const pendingTreatments = treatments.filter(
    (t: any) => t.completed === false
  );
  const historicTreatments = treatments.filter(
    (t: any) => t.completed === true
  );

  // Helper to check if a treatment is being completed
  const isCompleting = (id: string) => {
    if (navigation.state !== "submitting") return false;
    const formData = navigation.formData;
    return formData?.get("id") === id;
  };

  return (
    <Dialog open={viewOpen} onOpenChange={setViewOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto w-full max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>Treatments for {cattleData.tag_number}</DialogTitle>
          <DialogDescription>
            View all pending and historic treatments for this animal.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4">
          <div className="font-semibold">
            Tag Number: {cattleData.tag_number}
          </div>
          <div>Breed: {cattleData.breed || "Not specified"}</div>
          <div>Gender: {cattleData.gender}</div>
          <div>Mass: {cattleData.mass} kg</div>
        </div>
        <div className="space-y-4">
          {/* Pending Treatments Section */}
          <div>
            <div className="font-semibold mb-1">Pending Treatments</div>
            {pendingTreatments.length === 0 ? (
              <div className="text-muted-foreground">
                No pending treatments.
              </div>
            ) : (
              pendingTreatments.map((t: any, i: number) => (
                <div
                  key={t.id || i}
                  className="flex justify-between items-center gap-4 border-b last:border-b-0 pb-2 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{t.treatment}</div>
                    <div>
                      Date:{" "}
                      {t.date ? new Date(t.date).toLocaleDateString() : "-"}
                    </div>
                    {t.followUp && (
                      <div>
                        Follow-up: {new Date(t.followUp).toLocaleDateString()}
                      </div>
                    )}
                    <div>Status: Pending</div>
                  </div>
                  <div className="flex items-center justify-center h-full w-24">
                    <Form method="post" className="mt-1" navigate={false}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={isCompleting(t.id)}
                      >
                        {isCompleting(t.id) ? "Completing..." : "Complete"}
                      </Button>
                    </Form>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Historic Treatments Section */}
          <div className="mt-4">
            <div className="font-semibold mb-1">History</div>
            {historicTreatments.length === 0 ? (
              <div className="text-muted-foreground">
                No historic treatments.
              </div>
            ) : (
              historicTreatments.map((t: any, i: number) => (
                <div
                  key={t.id || i}
                  className="flex flex-col gap-1 border-b last:border-b-0 pb-2 last:pb-0"
                >
                  <div className="font-semibold">{t.treatment}</div>
                  <div>
                    Date: {t.date ? new Date(t.date).toLocaleDateString() : "-"}
                  </div>
                  {t.followUp && (
                    <div>
                      Follow-up: {new Date(t.followUp).toLocaleDateString()}
                    </div>
                  )}
                  <div>Status: Completed</div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
