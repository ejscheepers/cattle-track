import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/auth";
import { cattle, treatment } from "@/models/schema.server";
import { db } from "@/utils/db.server";
import { eq } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/track-cattle.treatment.$tag";

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
  // Fetch unique treatment suggestions
  const treatmentRows = await db
    .select({ treatment: treatment.treatment })
    .from(treatment);
  const treatmentSuggestions = Array.from(
    new Set(treatmentRows.map((t) => t.treatment).filter(Boolean))
  );
  return { cattleData: cattleData[0], treatmentSuggestions };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const cattleId = String(formData.get("cattleId") || "");
  const treatmentName = String(formData.get("treatment") || "");
  const date = formData.get("date")
    ? new Date(String(formData.get("date")))
    : new Date();
  const followUp = formData.get("followUp")
    ? new Date(String(formData.get("followUp")))
    : undefined;
  if (!cattleId || !treatmentName) {
    return { error: "Missing cattle or treatment." };
  }
  await db.insert(treatment).values({
    cattleId,
    treatment: treatmentName,
    date,
    followUp,
    completed: false,
  });
  return redirect("/track-cattle");
}

export default function AddTreatmentByTag() {
  const { cattleData, treatmentSuggestions } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);
  const treatmentInputRef = useRef<HTMLInputElement>(null);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const success = useActionData<typeof action>();
  const isAddLoading =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    if (!addOpen || success) {
      navigate("..", { preventScrollReset: true });
    }
  }, [success, addOpen]);

  return (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Treatment</DialogTitle>
          <DialogDescription>
            Add a treatment for this animal.
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
        {addError && (
          <div className="text-red-500 text-sm mb-2">{addError}</div>
        )}
        <Form
          method="post"
          className="space-y-4"
          preventScrollReset
          onSubmit={() => setAddError(null)}
        >
          <input type="hidden" name="cattleId" value={cattleData.id} />
          <div>
            <Label htmlFor="treatment">Treatment</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {treatmentSuggestions.map((s: string) => (
                <Badge
                  key={s}
                  variant={
                    treatmentInputRef.current?.value === s
                      ? "secondary"
                      : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => {
                    if (treatmentInputRef.current) {
                      treatmentInputRef.current.value = s;
                      treatmentInputRef.current.focus();
                    }
                  }}
                >
                  {s}
                </Badge>
              ))}
            </div>
            <Input
              name="treatment"
              id="treatment"
              ref={treatmentInputRef}
              required
            />
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              name="date"
              id="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <div>
            <Label htmlFor="followUp">Follow-up Date (optional)</Label>
            <Input name="followUp" id="followUp" type="date" />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              loading={isAddLoading}
              disabled={isAddLoading}
            >
              Add
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
