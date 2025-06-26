import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { auth } from "@/lib/auth";
import { cattle, treatment } from "@/models/schema.server";
import { db } from "@/utils/db.server";
import { desc, eq, ilike, inArray } from "drizzle-orm";
import { useRef, useState, useEffect } from "react";
import {
  Form,
  redirect,
  useSubmit,
  useLoaderData,
  useNavigation,
  useActionData,
} from "react-router";
import type { Route } from "./+types/track-cattle";
import {
  getAllPrefixes,
  getRandomPrefix,
  parseTag,
} from "@/lib/cattle-tag-utils";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Eye,
  Edit,
  Trash2,
  Tag,
  Scale,
  Heart,
  Search,
  Calendar,
  ChevronDown,
  PlusCircle,
  Stethoscope,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const GENDER_OPTIONS = [
  { value: "bul", label: "Bul" },
  { value: "vers", label: "Vers" },
  { value: "os", label: "Os" },
  { value: "koei", label: "Koei" },
];

export async function loader({ request }: Route.LoaderArgs) {
  let session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session) {
    throw redirect("/login");
  }
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  let query = db.select().from(cattle);
  const filteredQuery = search
    ? query.where(ilike(cattle.tag_number, `%${search}%`))
    : query;
  let cattleData = (await filteredQuery) as any[];
  // Sort by prefix, then by number (ascending)
  cattleData.sort((a, b) => {
    const pa = parseTag(a.tag_number);
    const pb = parseTag(b.tag_number);
    if (!pa || !pb) return 0;
    if (pa.prefix < pb.prefix) return -1;
    if (pa.prefix > pb.prefix) return 1;
    return pa.number - pb.number;
  });
  // Fetch unique breeds for suggestions
  const breedRows = await db.select({ breed: cattle.breed }).from(cattle);
  const breedSuggestions = Array.from(
    new Set(breedRows.map((b) => b.breed).filter(Boolean))
  );
  // Fetch all treatments and group by cattleId
  const treatments = await db.select().from(treatment);
  const treatmentSuggestions = Array.from(
    new Set(treatments.map((t) => t.treatment))
  );
  const treatmentsByCattle: Record<string, any[]> = {};
  for (const t of treatments) {
    if (!treatmentsByCattle[t.cattleId]) treatmentsByCattle[t.cattleId] = [];
    treatmentsByCattle[t.cattleId].push(t);
  }
  return {
    cattleData,
    isLoggedIn: !!session,
    search,
    breedSuggestions,
    treatmentsByCattle,
    treatmentSuggestions,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const action = String(formData.get("_action") || "");
  const addGroup = formData.get("add_group") === "1";
  if (action === "add" && (addGroup || !addGroup)) {
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
    let tagMap: Record<string, Set<number>> = {};
    let usedPrefixes = new Set<string>();
    for (const row of allTags) {
      const parsed = parseTag(row.tag_number);
      if (parsed) {
        if (!tagMap[parsed.prefix]) tagMap[parsed.prefix] = new Set();
        tagMap[parsed.prefix].add(parsed.number);
        usedPrefixes.add(parsed.prefix);
      }
    }
    // Find the current prefix (last used with available slots), or pick a new one
    let prefix = null;
    let number = 0;
    // Try to find a prefix with available slots (max 99)
    for (const p of usedPrefixes) {
      if (tagMap[p] && tagMap[p].size < 99) {
        prefix = p;
        number = Math.max(...Array.from(tagMap[p]));
        break;
      }
    }
    // If none, pick a new random prefix
    if (!prefix) {
      prefix = getRandomPrefix(usedPrefixes);
      number = 0;
      tagMap[prefix] = new Set();
    }
    const tagNumbers: string[] = [];
    for (let i = 0; i < groupCount; i++) {
      number++;
      if (number > 99) {
        usedPrefixes.add(prefix);
        prefix = getRandomPrefix(usedPrefixes);
        number = 1;
        if (!tagMap[prefix]) tagMap[prefix] = new Set();
      }
      // Ensure uniqueness
      while (tagMap[prefix] && tagMap[prefix].has(number)) {
        number++;
        if (number > 99) {
          usedPrefixes.add(prefix);
          prefix = getRandomPrefix(usedPrefixes);
          number = 1;
          if (!tagMap[prefix]) tagMap[prefix] = new Set();
        }
      }
      tagMap[prefix].add(number);
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
    return redirect(`/track-cattle`);
  } else if (action === "edit") {
    const id = String(formData.get("id") || "");
    const tag_number = String(formData.get("tag_number") || "");
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
        tag_number,
        gender,
        breed,
        mass,
        ...(receivedAt ? { receivedAt } : {}),
        ...(receivedAge !== undefined ? { receivedAge } : {}),
      })
      .where(eq(cattle.id, id));
  } else if (action === "delete") {
    const id = String(formData.get("id") || "");
    if (id) {
      await db.delete(cattle).where(eq(cattle.id, id));
    }
    return redirect(`/track-cattle`);
  } else if (action === "bulk_delete") {
    // Bulk delete logic
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length > 0) {
      await db.delete(cattle).where(inArray(cattle.id, ids));
    }
    return redirect(`/track-cattle`);
  } else if (action === "add_treatment") {
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
    return redirect(`/track-cattle`);
  } else if (action === "bulk_add_treatment") {
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
    return redirect(`/track-cattle`);
  }
  return redirect(`/track-cattle`);
}

// Utility to calculate and format cattle age
function getCattleAge(receivedAt: string | Date, receivedAge: number) {
  const receivedDate = new Date(receivedAt);
  const now = new Date();
  let monthsSinceReceived =
    (now.getFullYear() - receivedDate.getFullYear()) * 12 +
    (now.getMonth() - receivedDate.getMonth());
  // If the current day is before the received day, subtract one month
  if (now.getDate() < receivedDate.getDate()) {
    monthsSinceReceived--;
  }
  const totalMonths = Math.max(0, (receivedAge || 0) + monthsSinceReceived);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years > 0 && months > 0) {
    return `${years} year${years > 1 ? "s" : ""} ${months} month${
      months > 1 ? "s" : ""
    }`;
  } else if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}`;
  } else {
    return `${months} month${months !== 1 ? "s" : ""}`;
  }
}

export default function TrackCattle() {
  const {
    cattleData,
    isLoggedIn,
    search,
    breedSuggestions,
    treatmentsByCattle = {},
    treatmentSuggestions = [],
  } = useLoaderData();
  const [searchValue, setSearchValue] = useState(search || "");
  const [addOpen, setAddOpen] = useState(false);
  const [addGroup, setAddGroup] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editCattle, setEditCattle] = useState<any>(null);
  const submit = useSubmit();
  const navigation = useNavigation();
  const addFormRef = useRef<HTMLFormElement>(null);
  const actionData = useActionData() as any;
  const [addGender, setAddGender] = useState("");
  const [editGender, setEditGender] = useState<string | null>(null);
  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Treatment dialog state
  const [treatmentOpen, setTreatmentOpen] = useState<string | null>(null);
  const [bulkTreatmentOpen, setBulkTreatmentOpen] = useState(false);
  // Add this state to track which dialog was last submitted
  const [lastSubmittedDialog, setLastSubmittedDialog] = useState<
    | null
    | "add"
    | "edit"
    | "delete"
    | "bulkDelete"
    | "treatment"
    | "bulkTreatment"
  >(null);
  // Pending treatments filter state
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // Add refs for breed and treatment inputs
  const addBreedInputRef = useRef<HTMLInputElement>(null);
  const editBreedInputRef = useRef<HTMLInputElement>(null);
  const treatmentInputRef = useRef<HTMLInputElement>(null);
  const bulkTreatmentInputRef = useRef<HTMLInputElement>(null);

  // Add this useEffect to close dialogs only after successful submission
  useEffect(() => {
    if (navigation.state === "idle" && lastSubmittedDialog) {
      switch (lastSubmittedDialog) {
        case "add":
          setAddOpen(false);
          setAddGroup(false);
          setAddError(null);
          if (addFormRef.current) addFormRef.current.reset();
          break;
        case "edit":
          setEditOpen(null);
          setEditCattle(null);
          break;
        case "delete":
          setDeleteOpen(null);
          setDeleteConfirm(false);
          break;
        case "bulkDelete":
          setBulkDeleteOpen(false);
          setBulkDeleteConfirm(false);
          setSelectMode(false);
          setSelectedIds([]);
          break;
        case "treatment":
          setTreatmentOpen(null);
          break;
        case "bulkTreatment":
          setBulkTreatmentOpen(false);
          break;
      }
      setLastSubmittedDialog(null);
    }
  }, [navigation.state, lastSubmittedDialog]);

  // Show backend error in dialog if present
  useEffect(() => {
    if (actionData && actionData.error) {
      setAddOpen(true);
      setAddError(actionData.error);
    }
  }, [actionData]);

  // Filter client-side for instant search UX
  let filteredCattle = searchValue
    ? cattleData.filter((c: any) =>
        c.tag_number.toLowerCase().includes(searchValue.toLowerCase())
      )
    : cattleData;
  if (showPendingOnly) {
    filteredCattle = filteredCattle.filter((c: any) => {
      const treatments = treatmentsByCattle[c.id] || [];
      return treatments.some((t: any) => t.completed === false);
    });
  }

  function handleEditOpen(c: any) {
    setEditCattle(c);
    setEditOpen(c.id);
  }

  function handleEditClose() {
    setEditOpen(null);
    setEditCattle(null);
  }

  function handleSelectToggle() {
    setSelectMode((prev) => !prev);
    setSelectedIds([]);
  }

  function handleCardSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  }

  function handleSelectAll() {
    // Add all filtered IDs to selectedIds (union)
    setSelectedIds((prev) =>
      Array.from(new Set([...prev, ...filteredCattle.map((c: any) => c.id)]))
    );
  }

  function handleDeselectAll() {
    // Remove only filtered IDs from selectedIds
    setSelectedIds((prev) =>
      prev.filter((id) => !filteredCattle.some((c: any) => c.id === id))
    );
  }

  // CattleCard component for card UI
  function CattleCard({ cattle }: { cattle: any }) {
    const isSelected = selectedIds.includes(cattle.id);
    const [showTreatments, setShowTreatments] = useState(false);
    const treatments = treatmentsByCattle[cattle.id] || [];
    return (
      <Card
        className={`w-full max-w-sm mx-auto shadow-sm hover:shadow-md transition-shadow relative ${
          selectMode
            ? "pr-8 cursor-pointer ring-2 ring-offset-2 " +
              (isSelected ? "ring-blue-500" : "ring-transparent")
            : ""
        }`}
        onClick={
          selectMode
            ? (e) => {
                if ((e.target as HTMLElement).closest('input[type="checkbox"]'))
                  return;
                handleCardSelect(cattle.id);
              }
            : undefined
        }
        tabIndex={selectMode ? 0 : -1}
        aria-pressed={selectMode ? isSelected : undefined}
      >
        {selectMode && (
          <input
            type="checkbox"
            className="absolute top-3 right-3 z-10 h-5 w-5"
            checked={isSelected}
            onChange={() => handleCardSelect(cattle.id)}
            aria-label="Select cattle"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-lg">{cattle.tag_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={treatments.length > 0 ? "default" : "secondary"}
                className="flex items-center gap-1"
              >
                <Stethoscope className="h-3 w-3 mr-1" />
                {treatments.length}
              </Badge>
              <Badge
                variant={cattle.gender === "bul" ? "default" : "secondary"}
                className="capitalize"
              >
                {GENDER_OPTIONS.find((opt) => opt.value === cattle.gender)
                  ?.label || cattle.gender}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="h-3 w-3" />
                <span>Breed</span>
              </div>
              <p className="font-medium">{cattle.breed || "Not specified"}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Scale className="h-3 w-3" />
                <span>Mass</span>
              </div>
              <p className="font-medium">{cattle.mass} kg</p>
            </div>
          </div>
          {/* Age row */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Age</span>
            </div>
            <p className="font-medium">
              {getCattleAge(cattle.receivedAt, cattle.receivedAge)}
            </p>
          </div>
          {/* Treatments collapsible */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-blue-600 hover:underline text-sm mb-1"
              onClick={() => setShowTreatments((v) => !v)}
              aria-expanded={showTreatments}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showTreatments ? "rotate-180" : ""
                }`}
              />
              Treatments ({treatments.length})
            </button>
            {showTreatments && (
              <div className="border rounded p-2 bg-muted text-sm space-y-2">
                {treatments.length === 0 && <div>No treatments recorded.</div>}
                {treatments.map((t: any, i: any) => (
                  <div
                    key={t.id || i}
                    className="flex flex-col gap-1 border-b last:border-b-0 pb-2 last:pb-0"
                  >
                    <div className="font-semibold">{t.treatment}</div>
                    <div>
                      Date:{" "}
                      {t.date ? new Date(t.date).toLocaleDateString() : "-"}
                    </div>
                    {t.followUp && (
                      <>
                        <div>
                          Follow-up: {new Date(t.followUp).toLocaleDateString()}
                        </div>{" "}
                        <div>
                          Status: {t.completed ? "Completed" : "Pending"}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Add Treatment Button */}
          {!selectMode && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
              onClick={() => {
                setTreatmentOpen(cattle.id);
              }}
              aria-label="Add Treatment"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Add Treatment
            </Button>
          )}
          {!selectMode && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                onClick={() => handleEditOpen(cattle)}
                aria-label="View/Edit"
              >
                <Eye className="h-4 w-4 mr-1" />
                View/Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 w-full bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                aria-label="Delete"
                onClick={() => {
                  setDeleteOpen(cattle.id);
                  setDeleteConfirm(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Nav isLoggedIn={isLoggedIn} />
      <div className="flex min-h-full flex-1 flex-col sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full flex flex-col sm:flex-row items-center justify-between mt-6 gap-2">
          <h2
            id="dashboard-header"
            className="text-2xl font-bold leading-9 tracking-tight text-gray-900 text-center w-full sm:w-auto"
          >
            Track Cattle
          </h2>
          <div className="flex flex-col md:flex-row gap-2 w-full sm:w-auto justify-end">
            <div className="relative w-full max-w-sm mx-auto sm:w-auto sm:max-w-none sm:mx-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Search className="h-4 w-4" />
              </span>
              <Input
                placeholder="Search by tag number..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full pl-10"
                aria-label="Search by tag number"
              />
            </div>
            {/* Pending treatments filter switch */}
            <div className="flex items-center gap-2">
              <Switch
                id="pending-filter"
                checked={showPendingOnly}
                onCheckedChange={setShowPendingOnly}
              />
              <Label htmlFor="pending-filter" className="whitespace-nowrap">
                Show only cattle with pending treatments
              </Label>
            </div>
            <div className="flex gap-2 mb-2">
              <Button
                variant={selectMode ? "secondary" : "outline"}
                onClick={handleSelectToggle}
                className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
              >
                {selectMode ? "Cancel Select" : "Bulk Select"}
              </Button>
              {selectMode && (
                <Button
                  variant="destructive"
                  disabled={selectedIds.length === 0}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                >
                  Delete Selected
                </Button>
              )}
              {selectMode &&
                (selectedIds.length < filteredCattle.length ? (
                  <Button
                    variant="outline"
                    onClick={handleSelectAll}
                    className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                  >
                    Select All
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleDeselectAll}
                    className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                  >
                    Deselect All
                  </Button>
                ))}
              {selectMode && (
                <Button
                  variant="outline"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setBulkTreatmentOpen(true);
                  }}
                  className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Add Treatment to Selected
                </Button>
              )}
            </div>
            {!selectMode && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setAddOpen(true)}
                    className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                  >
                    Add Cattle
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-full max-w-md mx-auto">
                  <DialogHeader>
                    <DialogTitle>Add Cattle</DialogTitle>
                    <DialogDescription>
                      Enter new cattle details.
                    </DialogDescription>
                  </DialogHeader>
                  {addError && (
                    <div className="text-red-500 text-sm mb-2">{addError}</div>
                  )}
                  <Form
                    method="post"
                    className="space-y-4"
                    ref={addFormRef}
                    onSubmit={() => {
                      setAddError(null);
                      setLastSubmittedDialog("add");
                    }}
                  >
                    <input type="hidden" name="_action" value="add" />
                    <input
                      type="hidden"
                      name="add_group"
                      value={addGroup ? "1" : "0"}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="add_group"
                        checked={addGroup}
                        onChange={(e) => setAddGroup(e.target.checked)}
                      />
                      <Label htmlFor="add_group">Add group</Label>
                    </div>
                    {!addGroup && null}
                    {addGroup && (
                      <>
                        <div>
                          <Label htmlFor="group_count">
                            Number of cattle to add
                          </Label>
                          <Input
                            name="group_count"
                            id="group_count"
                            type="number"
                            min={1}
                            required
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <Label htmlFor="gender">Gender</Label>
                      <Select
                        value={addGender}
                        onValueChange={setAddGender}
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
                        value={addGender}
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
                      <Input
                        name="breed"
                        id="breed"
                        ref={addBreedInputRef}
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
                        defaultValue={new Date().toISOString().slice(0, 10)}
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
                        defaultValue={0}
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit">Add</Button>
                      <DialogClose asChild>
                        <Button type="button" variant="secondary">
                          Cancel
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        <div className="mt-6 sm:mx-auto sm:w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCattle.length === 0 && (
              <div className="col-span-full text-center py-4">
                No cattle found.
              </div>
            )}
            {filteredCattle.map((c: any) => (
              <div key={c.id}>
                <CattleCard cattle={c} />
                {/* Edit Dialog for this cattle */}
                <Dialog
                  open={editOpen === c.id}
                  onOpenChange={(open) =>
                    open ? handleEditOpen(c) : handleEditClose()
                  }
                >
                  <DialogContent className="w-full max-w-md mx-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Cattle</DialogTitle>
                      <DialogDescription>
                        Update cattle details.
                      </DialogDescription>
                    </DialogHeader>
                    <Form
                      method="post"
                      className="space-y-4"
                      onSubmit={() => setLastSubmittedDialog("edit")}
                    >
                      <input type="hidden" name="_action" value="edit" />
                      <input type="hidden" name="id" value={c.id} />
                      <div>
                        <Label htmlFor="tag_number">Tag Number</Label>
                        <Input
                          disabled
                          name="tag_number"
                          id="tag_number"
                          defaultValue={c.tag_number}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="gender">Gender</Label>
                        <Select
                          value={editGender ?? c.gender}
                          onValueChange={setEditGender}
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
                          value={editGender ?? c.gender}
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
                          defaultValue={c.breed}
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
                          defaultValue={c.mass}
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
                            c.receivedAt
                              ? new Date(c.receivedAt)
                                  .toISOString()
                                  .slice(0, 10)
                              : ""
                          }
                          required
                        />
                      </div>
                      {/* Received Age */}
                      <div>
                        <Label htmlFor="receivedAge">
                          Received Age (months)
                        </Label>
                        <Input
                          name="receivedAge"
                          id="receivedAge"
                          type="number"
                          min={0}
                          defaultValue={c.receivedAge ?? 0}
                          required
                        />
                      </div>
                      <DialogFooter>
                        <Button type="submit">Save</Button>
                        <DialogClose asChild>
                          <Button type="button" variant="secondary">
                            Cancel
                          </Button>
                        </DialogClose>
                      </DialogFooter>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Delete confirmation dialog (Shadcn) */}
      <Dialog
        open={!!deleteOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteOpen(null);
        }}
      >
        <DialogContent className="w-full max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Cattle</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this cattle? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
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
            onSubmit={() => setLastSubmittedDialog("delete")}
          >
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="id" value={deleteOpen || ""} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!deleteConfirm || navigation.state !== "idle"}
            >
              Delete
            </Button>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Bulk delete confirmation dialog */}
      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteOpen(open);
        }}
      >
        <DialogContent className="w-full max-w-sm mx-auto">
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
              {selectedIds.map((id) => {
                const c = cattleData.find((c: any) => c.id === id);
                return c ? <li key={id}>{c.tag_number}</li> : null;
              })}
            </ul>
          </div>
          <div className="flex items-center gap-2 py-4">
            <Switch
              id="bulk-delete-confirm"
              checked={bulkDeleteConfirm}
              onCheckedChange={setBulkDeleteConfirm}
            />
            <Label htmlFor="bulk-delete-confirm">
              I understand, delete selected cattle
            </Label>
          </div>
          <Form
            method="post"
            className="flex justify-end gap-2"
            onSubmit={() => setLastSubmittedDialog("bulkDelete")}
          >
            <input type="hidden" name="_action" value="bulk_delete" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBulkDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!bulkDeleteConfirm || navigation.state !== "idle"}
            >
              Delete Selected
            </Button>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Add Treatment Dialog (per cattle) */}
      <Dialog
        open={!!treatmentOpen}
        onOpenChange={(open) => {
          if (!open) setTreatmentOpen(null);
        }}
      >
        <DialogContent className="w-full max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Add Treatment</DialogTitle>
            <DialogDescription>
              Add a treatment for this animal.
            </DialogDescription>
          </DialogHeader>
          <Form
            method="post"
            className="space-y-4"
            onSubmit={() => {
              setLastSubmittedDialog("treatment");
            }}
          >
            <input type="hidden" name="_action" value="add_treatment" />
            <input type="hidden" name="cattleId" value={treatmentOpen || ""} />
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
              <Button type="submit">Add</Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Bulk Add Treatment Dialog */}
      <Dialog
        open={bulkTreatmentOpen}
        onOpenChange={(open) => {
          if (!open) setBulkTreatmentOpen(open);
        }}
      >
        <DialogContent className="w-full max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Add Treatment to Selected</DialogTitle>
            <DialogDescription>
              Add a treatment for all selected cattle.
            </DialogDescription>
          </DialogHeader>
          <Form
            method="post"
            className="space-y-4"
            onSubmit={() => {
              setLastSubmittedDialog("bulkTreatment");
            }}
          >
            <input type="hidden" name="_action" value="bulk_add_treatment" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <div>
              <Label htmlFor="treatment">Treatment</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {treatmentSuggestions.map((s: string) => (
                  <Badge
                    key={s}
                    variant={
                      bulkTreatmentInputRef.current?.value === s
                        ? "secondary"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => {
                      if (bulkTreatmentInputRef.current) {
                        bulkTreatmentInputRef.current.value = s;
                        bulkTreatmentInputRef.current.focus();
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
                ref={bulkTreatmentInputRef}
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
              <Button type="submit">Add to Selected</Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
