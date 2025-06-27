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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auth } from "@/lib/auth";
import { cattle } from "@/models/schema.server";
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
import type { Route } from "./+types/track-cattle.edit.$tag";
import { GENDER_OPTIONS } from "./track-cattle";

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

  // Fetch unique breeds for suggestions
  const breedRows = await db.select({ breed: cattle.breed }).from(cattle);
  const breedSuggestions = Array.from(
    new Set(breedRows.map((b) => b.breed).filter(Boolean))
  );

  return { cattleData: cattleData[0], breedSuggestions };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const id = String(formData.get("id") || "");
  const gender = String(formData.get("gender") || "") as
    | "bul"
    | "vers"
    | "os"
    | "koei";
  const breed = String(formData.get("breed") || "");
  const mass = Number(formData.get("mass") || 0);
  const receivedAt = formData.get("receivedAt")
    ? new Date(String(formData.get("receivedAt")))
    : undefined;
  const receivedAge = formData.get("receivedAge")
    ? Number(formData.get("receivedAge"))
    : undefined;
  await db
    .update(cattle)
    .set({
      gender,
      breed,
      mass,
      ...(receivedAt ? { receivedAt } : {}),
      ...(receivedAge !== undefined ? { receivedAge } : {}),
    })
    .where(eq(cattle.id, id));
  return redirect(`/track-cattle`);
}

export default function TrackCattleByTag() {
  const { cattleData, breedSuggestions } = useLoaderData<typeof loader>();
  const [editOpen, setEditOpen] = useState(true);
  const [editGender, setEditGender] = useState<string | null>(null);
  const editBreedInputRef = useRef<HTMLInputElement>(null);
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isEditLoading =
    navigation.state === "submitting" || navigation.state === "loading";
  const success = useActionData<typeof action>();

  useEffect(() => {
    if (!editOpen || success) {
      navigate("..", { preventScrollReset: true });
    }
  }, [success, editOpen]);

  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="w-full max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>Edit Cattle</DialogTitle>
          <DialogDescription>Update cattle details.</DialogDescription>
        </DialogHeader>
        <Form method="post" className="space-y-4" preventScrollReset>
          <input type="hidden" name="_action" value="edit" />
          <input type="hidden" name="id" value={cattleData.id} />
          <div>
            <Label htmlFor="tag_number">Tag Number</Label>
            <Input
              disabled
              name="tag_number"
              id="tag_number"
              defaultValue={cattleData.tag_number}
              required
            />
          </div>
          <div>
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={cattleData.gender}
              onValueChange={(value) => {
                setEditGender(value as string);
              }}
              required
            >
              <SelectTrigger className="w-full border rounded-md px-3 py-2">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="hidden"
              name="gender"
              value={editGender ?? cattleData.gender}
              required
            />
          </div>
          <div>
            <Label htmlFor="breed">Breed</Label>
            {/* Breed suggestions as badges */}
            {breedSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {breedSuggestions.map((breed: string) => (
                  <Badge
                    key={breed}
                    variant={
                      editBreedInputRef.current?.value === breed
                        ? "secondary"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => {
                      if (editBreedInputRef.current) {
                        editBreedInputRef.current.value = breed;
                        editBreedInputRef.current.focus();
                      }
                    }}
                  >
                    {breed}
                  </Badge>
                ))}
              </div>
            )}
            <Input
              name="breed"
              id="breed"
              ref={editBreedInputRef}
              defaultValue={cattleData.breed}
              required
            />
          </div>
          <div>
            <Label htmlFor="mass">Mass (kg)</Label>
            <Input
              name="mass"
              id="mass"
              type="number"
              min={0}
              defaultValue={cattleData.mass}
              required
            />
          </div>
          {/* Receive Date */}
          <div>
            <Label htmlFor="receivedAt">Receive Date</Label>
            <Input
              name="receivedAt"
              id="receivedAt"
              type="date"
              defaultValue={
                cattleData.receivedAt
                  ? new Date(cattleData.receivedAt).toISOString().slice(0, 10)
                  : ""
              }
              required
            />
          </div>
          {/* Received Age */}
          <div>
            <Label htmlFor="receivedAge">Received Age (months)</Label>
            <Input
              name="receivedAge"
              id="receivedAge"
              type="number"
              min={0}
              defaultValue={cattleData.receivedAge ?? 0}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              loading={isEditLoading}
              disabled={isEditLoading}
            >
              Save
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
