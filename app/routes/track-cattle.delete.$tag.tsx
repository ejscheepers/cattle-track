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
import type { Route } from "./+types/track-cattle.delete.$tag";

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
  return { cattleData: cattleData[0] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const id = String(formData.get("id") || "");
  if (id) {
    await db.delete(cattle).where(eq(cattle.id, id));
  }
  return redirect("/track-cattle");
}

export default function DeleteCattleByTag() {
  const { cattleData } = useLoaderData<typeof loader>();
  const [deleteOpen, setDeleteOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const success = useActionData<typeof action>();
  const isDeleteLoading =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    if (!deleteOpen || success) {
      navigate("..", { preventScrollReset: true });
    }
  }, [success, deleteOpen]);

  return (
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delete Cattle</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this cattle? This action cannot be
            undone.
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
        <div className="flex items-center gap-2 py-4">
          <Switch
            id="delete-confirm"
            checked={deleteConfirm}
            onCheckedChange={setDeleteConfirm}
          />
          <Label htmlFor="delete-confirm">
            I understand, delete this cattle
          </Label>
        </div>
        <Form
          method="post"
          className="flex justify-end gap-2"
          preventScrollReset
        >
          <input type="hidden" name="id" value={cattleData.id} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!deleteConfirm || isDeleteLoading}
            loading={isDeleteLoading}
          >
            Delete
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
