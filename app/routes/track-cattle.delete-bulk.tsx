import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { auth } from "@/lib/auth";
import { cattle } from "@/models/schema.server";
import { db } from "@/utils/db.server";
import { inArray } from "drizzle-orm";
import { useEffect, useState } from "react";
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
  return { cattleData };
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) {
    return { error: "No cattle selected for deletion." };
  }
  await db.delete(cattle).where(inArray(cattle.id, ids));
  return redirect("/track-cattle");
}

export default function BulkDeleteCattle() {
  const { cattleData } = useLoaderData<typeof loader>();
  const [open, setOpen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const success = useActionData<typeof action>();
  const isLoading =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    if (!open || success) {
      navigate("/track-cattle", { preventScrollReset: true });
    }
  }, [success, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delete Selected Cattle</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the selected cattle? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-32 overflow-y-auto border rounded p-2 mb-2 bg-muted text-sm">
          <div className="font-semibold mb-1">Tag numbers to be deleted:</div>
          <ul className="list-disc pl-5">
            {cattleData.map((c: any) => (
              <li key={c.id}>{c.tag_number}</li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 py-4">
          <Switch
            id="bulk-delete-confirm"
            checked={confirm}
            onCheckedChange={setConfirm}
          />
          <Label htmlFor="bulk-delete-confirm">
            I understand, delete selected cattle
          </Label>
        </div>
        <Form method="post" className="flex justify-end gap-2">
          {cattleData.map((c: any) => (
            <input key={c.id} type="hidden" name="ids" value={c.id} />
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!confirm || isLoading}
          >
            Delete Selected
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
