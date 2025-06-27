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
import { getNextAvailablePrefix, parseTag } from "@/lib/cattle-tag-utils";
import { cattle } from "@/models/schema.server";
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

export const GENDER_OPTIONS = [
  { value: "bul", label: "Bul" },
  { value: "vers", label: "Vers" },
  { value: "os", label: "Os" },
  { value: "koei", label: "Koei" },
];

export async function loader({ request }: { request: Request }) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw redirect("/login");
  }
  // Fetch unique breeds for suggestions
  const breedRows = await db.select({ breed: cattle.breed }).from(cattle);
  const breedSuggestions = Array.from(
    new Set(breedRows.map((b) => b.breed).filter(Boolean))
  );
  return { breedSuggestions };
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const addGroup = formData.get("add_group") === "1";
  const groupCount = addGroup ? Number(formData.get("group_count") || 0) : 1;
  const gender = String(formData.get("gender") || "") as
    | "bul"
    | "vers"
    | "os"
    | "koei";
  const breed = String(formData.get("breed") || "");
  const mass = Number(formData.get("mass") || 0);
  const receivedAt = formData.get("receivedAt")
    ? new Date(String(formData.get("receivedAt")))
    : new Date();
  const receivedAge = Number(formData.get("receivedAge") || 0);
  if (groupCount < 1) {
    return { error: "Invalid group count." };
  }
  // Get all existing tag numbers
  const allTags = await db
    .select({ tag_number: cattle.tag_number })
    .from(cattle);
  // Build prefix usage map and number sets
  let prefixUsage: Record<string, number> = {};
  let tagMap: Record<string, Set<number>> = {};
  for (const row of allTags) {
    const parsed = parseTag(row.tag_number);
    if (parsed) {
      if (!tagMap[parsed.prefix]) tagMap[parsed.prefix] = new Set();
      tagMap[parsed.prefix].add(parsed.number);
      prefixUsage[parsed.prefix] = (prefixUsage[parsed.prefix] || 0) + 1;
    }
  }
  let prefix = getNextAvailablePrefix(prefixUsage);
  let number = 0;
  if (!tagMap[prefix]) tagMap[prefix] = new Set();
  // Find the next available number for this prefix (1-50)
  for (let i = 1; i <= 50; i++) {
    if (!tagMap[prefix].has(i)) {
      number = i - 1;
      break;
    }
  }
  const tagNumbers: string[] = [];
  for (let i = 0; i < groupCount; i++) {
    number++;
    // If this prefix is full, move to next available prefix
    if (number > 50) {
      prefixUsage[prefix] = 50;
      prefix = getNextAvailablePrefix(prefixUsage);
      number = 1;
      if (!tagMap[prefix]) tagMap[prefix] = new Set();
    }
    // Ensure uniqueness
    while (tagMap[prefix] && tagMap[prefix].has(number)) {
      number++;
      if (number > 50) {
        prefixUsage[prefix] = 50;
        prefix = getNextAvailablePrefix(prefixUsage);
        number = 1;
        if (!tagMap[prefix]) tagMap[prefix] = new Set();
      }
    }
    tagMap[prefix].add(number);
    prefixUsage[prefix] = (prefixUsage[prefix] || 0) + 1;
    tagNumbers.push(`${prefix}${number}`);
  }
  // Check for existing tag numbers (shouldn't happen, but for safety)
  const existing = await db
    .select({ tag_number: cattle.tag_number })
    .from(cattle)
    .where(inArray(cattle.tag_number, tagNumbers));
  if (existing.length > 0) {
    return {
      error: `Tag number(s) already exist: ${existing
        .map((e) => e.tag_number)
        .join(", ")}`,
    };
  }
  // Insert all
  await db.insert(cattle).values(
    tagNumbers.map((tag_number) => ({
      tag_number,
      gender,
      breed,
      mass,
      receivedAt,
      receivedAge,
    }))
  );
  return redirect("/track-cattle");
}

export default function AddCattleModal() {
  const { breedSuggestions } = useLoaderData<typeof loader>();
  const [addOpen, setAddOpen] = useState(true);
  const [addGroup, setAddGroup] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addGender, setAddGender] = useState("");
  const addBreedInputRef = useRef<HTMLInputElement>(null);
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
          <DialogTitle>Add Cattle</DialogTitle>
          <DialogDescription>Enter new cattle details.</DialogDescription>
        </DialogHeader>
        {addError && (
          <div className="text-red-500 text-sm mb-2">{addError}</div>
        )}
        <Form
          method="post"
          className="space-y-4"
          onSubmit={() => setAddError(null)}
        >
          <input type="hidden" name="add_group" value={addGroup ? "1" : "0"} />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="add_group"
              checked={addGroup}
              onChange={(e) => setAddGroup(e.target.checked)}
            />
            <Label htmlFor="add_group">Add group</Label>
          </div>
          {addGroup && (
            <div>
              <Label htmlFor="group_count">Number of cattle to add</Label>
              <Input
                name="group_count"
                id="group_count"
                type="number"
                min={1}
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="gender">Gender</Label>
            <Select value={addGender} onValueChange={setAddGender} required>
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
            <input type="hidden" name="gender" value={addGender} required />
          </div>
          <div>
            <Label htmlFor="breed">Breed</Label>
            {breedSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {breedSuggestions.map((breed: string) => (
                  <Badge
                    key={breed}
                    variant={
                      addBreedInputRef.current?.value === breed
                        ? "secondary"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => {
                      if (addBreedInputRef.current) {
                        addBreedInputRef.current.value = breed;
                        addBreedInputRef.current.focus();
                      }
                    }}
                  >
                    {breed}
                  </Badge>
                ))}
              </div>
            )}
            <Input name="breed" id="breed" ref={addBreedInputRef} required />
          </div>
          <div>
            <Label htmlFor="mass">Mass (kg)</Label>
            <Input name="mass" id="mass" type="number" min={0} required />
          </div>
          <div>
            <Label htmlFor="receivedAt">Receive Date</Label>
            <Input
              name="receivedAt"
              id="receivedAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <div>
            <Label htmlFor="receivedAge">Received Age (months)</Label>
            <Input
              name="receivedAge"
              id="receivedAge"
              type="number"
              min={0}
              defaultValue={0}
              required
            />
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
