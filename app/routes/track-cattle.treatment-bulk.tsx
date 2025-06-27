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
import { inArray } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";

export async function loader({ request }: { request: Request }) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw redirect("/login");
  }
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ids.length) {
    throw redirect("/track-cattle");
  }
  const cattleData = await db
    .select()
    .from(cattle)
    .where(inArray(cattle.id, ids));
  if (!cattleData.length) {
    throw redirect("/track-cattle");
  }
  // Fetch unique treatment suggestions
  const treatmentRows = await db
    .select({ treatment: treatment.treatment })
    .from(treatment);
  const treatmentSuggestions = Array.from(
    new Set(treatmentRows.map((t) => t.treatment).filter(Boolean))
  );
  return { cattleData, treatmentSuggestions };
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const treatmentName = String(formData.get("treatment") || "");
  const date = formData.get("date")
    ? new Date(String(formData.get("date")))
    : new Date();
  const followUp = formData.get("followUp")
    ? new Date(String(formData.get("followUp")))
    : undefined;
  if (!ids.length || !treatmentName) {
    return { error: "Missing cattle or treatment." };
  }
  await db.insert(treatment).values(
    ids.map((cattleId) => ({
      cattleId,
      treatment: treatmentName,
      date,
      followUp,
      completed: false,
    }))
  );
  return redirect("/track-cattle");
}

export default function AddBulkTreatment() {
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
      navigate("/track-cattle", { preventScrollReset: true });
    }
  }, [success, addOpen]);

  return (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="w-full max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Add Treatment to Selected</DialogTitle>
          <DialogDescription>
            Add a treatment for all selected cattle.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4">
          <div className="font-semibold mb-1">Selected Tag Numbers:</div>
          <div className="flex flex-wrap gap-2">
            {cattleData.map((c: any) => (
              <Badge key={c.id}>{c.tag_number}</Badge>
            ))}
          </div>
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
          {cattleData.map((c: any) => (
            <input key={c.id} type="hidden" name="ids" value={c.id} />
          ))}
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
              Add to Selected
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
