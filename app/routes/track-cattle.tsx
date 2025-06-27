import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { auth } from "@/lib/auth";
import { parseTag } from "@/lib/cattle-tag-utils";
import { cattle, treatment } from "@/models/schema.server";
import { db } from "@/utils/db.server";
import { count, ilike } from "drizzle-orm";
import {
  Calendar,
  ChevronDown,
  Eye,
  Heart,
  PlusCircle,
  Scale,
  Search,
  Stethoscope,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/track-cattle";

export const GENDER_OPTIONS = [
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 30));
  const pageSize = 30;

  // Get total count for pagination
  const countRows = await db
    .select({ count: count() })
    .from(cattle)
    .where(search ? ilike(cattle.tag_number, `%${search}%`) : undefined);
  const totalCount = Number(countRows[0]?.count) || 0;

  // Clamp page to valid range
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const offset = (clampedPage - 1) * pageSize;

  // Get paginated data
  let paginatedQuery = db
    .select()
    .from(cattle)
    .where(search ? ilike(cattle.tag_number, `%${search}%`) : undefined)
    .limit(pageSize)
    .offset(offset);
  let cattleData = (await paginatedQuery) as any[];

  // Sort by prefix, then by number (ascending)
  cattleData.sort((a, b) => {
    const pa = parseTag(a.tag_number);
    const pb = parseTag(b.tag_number);
    if (!pa || !pb) return 0;
    if (pa.prefix < pb.prefix) return -1;
    if (pa.prefix > pb.prefix) return 1;
    return pa.number - pb.number;
  });

  // Fetch all treatments and group by cattleId
  const treatments = await db.select().from(treatment);
  const treatmentsByCattle: Record<string, any[]> = {};
  for (const t of treatments) {
    if (!treatmentsByCattle[t.cattleId]) treatmentsByCattle[t.cattleId] = [];
    treatmentsByCattle[t.cattleId].push(t);
  }
  // Precompute ageMonths for each cattle
  cattleData = cattleData.map((c) => ({
    ...c,
    ageMonths: getCattleAgeInMonths(c.receivedAt, c.receivedAge),
  }));
  const ages = cattleData.map((c) => c.ageMonths);
  let minAgeMonths = ages.length > 0 ? Math.min(...ages) : 0;
  let maxAgeMonths = ages.length > 0 ? Math.max(...ages) : 120;
  if (minAgeMonths === maxAgeMonths) {
    maxAgeMonths = minAgeMonths + 1;
  }
  return {
    cattleData,
    isLoggedIn: !!session,
    search,
    treatmentsByCattle,
    minAgeMonths,
    maxAgeMonths,
    page: clampedPage,
    totalPages,
  };
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

// Utility to calculate cattle age in months (number)
function getCattleAgeInMonths(receivedAt: string | Date, receivedAge: number) {
  const receivedDate = new Date(receivedAt);
  const now = new Date();
  let monthsSinceReceived =
    (now.getFullYear() - receivedDate.getFullYear()) * 12 +
    (now.getMonth() - receivedDate.getMonth());
  if (now.getDate() < receivedDate.getDate()) {
    monthsSinceReceived--;
  }
  return Math.max(0, (receivedAge || 0) + monthsSinceReceived);
}

export default function TrackCattle() {
  const {
    cattleData,
    isLoggedIn,
    search,
    treatmentsByCattle = {},
    minAgeMonths,
    maxAgeMonths,
    page,
    totalPages,
  } = useLoaderData();

  const [searchValue, setSearchValue] = useState(search || "");

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pending treatments filter state
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  // Add state for pending treatment filter
  const [pendingTreatmentFilter, setPendingTreatmentFilter] =
    useState<string>("all");
  // Collapsible state for pending filters
  const [pendingFiltersOpen, setPendingFiltersOpen] = useState(false);
  // Age range state (from loader)
  const [ageRangeLimits] = useState<[number, number]>(
    minAgeMonths === maxAgeMonths
      ? [minAgeMonths, minAgeMonths + 1]
      : [minAgeMonths, maxAgeMonths]
  );
  const [ageRange, setAgeRange] = useState<[number, number]>(
    minAgeMonths === maxAgeMonths
      ? [minAgeMonths, minAgeMonths + 1]
      : [minAgeMonths, maxAgeMonths]
  );

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/track-cattle") {
      setSelectedIds([]);
      setSelectMode(false);
    }
  }, [location.pathname]);

  // When search changes, update URL and reset page
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (searchValue !== params.get("search")) {
      params.set("search", searchValue);
      params.set("page", "1");
      navigate(
        { pathname: location.pathname, search: params.toString() },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // Filter client-side for instant search UX
  let filteredCattle = searchValue
    ? cattleData.filter((c: any) =>
        c.tag_number.toLowerCase().includes(searchValue.toLowerCase())
      )
    : cattleData;
  // Age range filter
  filteredCattle = filteredCattle.filter((c: any) => {
    // If there was no range, allow both min and min+1
    if (ageRange[0] === ageRange[1] - 1) {
      return c.ageMonths === ageRange[0] || c.ageMonths === ageRange[1];
    }
    return c.ageMonths >= ageRange[0] && c.ageMonths <= ageRange[1];
  });
  if (showPendingOnly) {
    filteredCattle = filteredCattle.filter((c: any) => {
      const treatments = treatmentsByCattle[c.id] || [];
      // Only consider pending treatments
      const pendingTreatments = treatments.filter(
        (t: any) => t.completed === false
      );
      if (pendingTreatmentFilter && pendingTreatmentFilter !== "all") {
        return pendingTreatments.some(
          (t: any) => t.treatment === pendingTreatmentFilter
        );
      }
      return pendingTreatments.length > 0;
    });
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

  // Pagination controls
  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(location.search);
    params.set("page", String(newPage));
    navigate({ pathname: location.pathname, search: params.toString() });
  }

  // CattleCard component for card UI
  function CattleCard({ cattle }: { cattle: any }) {
    const isSelected = selectedIds.includes(cattle.id);
    const treatments = treatmentsByCattle[cattle.id] || [];
    // Split treatments
    const pendingTreatments = treatments.filter(
      (t: any) => t.completed === false
    );
    const historicTreatments = treatments.filter(
      (t: any) => t.completed === true
    );
    // Check if any pending treatment followUp is within 7 days
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const hasUrgentPending = pendingTreatments.some((t: any) => {
      if (!t.followUp) return false;
      const followUpDate = new Date(t.followUp);
      return followUpDate >= now && followUpDate <= oneWeekFromNow;
    });

    const navigation = useNavigation();

    return (
      <>
        <Card
          className={`w-full max-w-sm mx-auto shadow-sm hover:shadow-md transition-shadow relative ${
            selectMode
              ? "pr-8 cursor-pointer ring-2 ring-offset-2 " +
                (isSelected ? "ring-blue-500" : "ring-transparent")
              : ""
          } ${hasUrgentPending ? "border-2 border-red-500 bg-red-50" : ""}`}
          onClick={
            selectMode
              ? (e) => {
                  if (
                    (e.target as HTMLElement).closest('input[type="checkbox"]')
                  )
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
                <span className="font-semibold text-lg">
                  {cattle.tag_number}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    pendingTreatments.length > 0 ? "default" : "secondary"
                  }
                  className="flex items-center gap-1"
                >
                  <Stethoscope className="h-3 w-3 mr-1" />
                  {pendingTreatments.length}
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
            {/* View Treatments Button */}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              onClick={() => {
                navigate(`/track-cattle/treatment-view/${cattle.tag_number}`, {
                  preventScrollReset: true,
                });
              }}
              aria-label="View Treatments"
            >
              <Stethoscope className="h-4 w-4 mr-1" />
              View Treatments
            </Button>
            {/* Add Treatment Button */}
            {!selectMode && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                onClick={() => {
                  navigate(`/track-cattle/treatment/${cattle.tag_number}`, {
                    preventScrollReset: true,
                  });
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
                  onClick={() =>
                    navigate(`/track-cattle/edit/${cattle.tag_number}`, {
                      preventScrollReset: true,
                    })
                  }
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
                    navigate(`/track-cattle/delete/${cattle.tag_number}`, {
                      preventScrollReset: true,
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </>
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
              <span className="absolute left-3 inset-y-0 flex items-center text-muted-foreground pointer-events-none">
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
            {/* (Removed from here) */}
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
                  onClick={() => {
                    if (selectedIds.length > 0) {
                      navigate(
                        `/track-cattle/delete-bulk?ids=${selectedIds.join(
                          ","
                        )}`,
                        { preventScrollReset: true }
                      );
                    }
                  }}
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
                    if (selectedIds.length > 0) {
                      navigate(
                        `/track-cattle/treatment-bulk?ids=${selectedIds.join(
                          ","
                        )}`,
                        { preventScrollReset: true }
                      );
                    }
                  }}
                  className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Add Treatment to Selected
                </Button>
              )}
            </div>
            <Button
              onClick={() =>
                navigate("/track-cattle/add", {
                  preventScrollReset: true,
                })
              }
              className="w-full max-w-sm mx-auto sm:w-auto sm:mx-0"
            >
              Add Cattle
            </Button>
          </div>
        </div>

        {/* Pending Treatments Collapsible Filter */}
        <div className="max-w-sm sm:max-w-full w-full mx-auto sm:mx-0 my-4 border rounded-md bg-white transition-colors">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2  w-full justify-start"
            onClick={() => setPendingFiltersOpen((v) => !v)}
            aria-expanded={pendingFiltersOpen}
            aria-controls="pending-filters-panel"
          >
            <span className="font-medium">
              {pendingFiltersOpen ? "Hide Filters" : "Show Filters"}
            </span>
            <ChevronDown
              className={`h-5 w-5 transition-transform ${
                pendingFiltersOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {pendingFiltersOpen && (
            <div
              id="pending-filters-panel"
              className="mt-2 p-4 flex flex-col gap-4"
            >
              {/* Age Range Filter */}
              <div className="flex flex-col gap-2">
                <Label>Age Range</Label>
                <div className="flex items-center gap-4 max-w-md py-3">
                  <Slider
                    min={ageRangeLimits[0]}
                    max={ageRangeLimits[1]}
                    step={1}
                    value={ageRange}
                    onValueChange={(v: number[]) => {
                      // Prevent thumbs from overlapping
                      if (v.length !== 2 || v[0] === v[1]) return;
                      setAgeRange([v[0], v[1]]);
                    }}
                    className="flex-1"
                    minStepsBetweenThumbs={1}
                    formatLabel={(value: number) => {
                      const years = Math.floor(value / 12);
                      const months = value % 12;
                      return years > 0 ? `${years}y ${months}m` : `${months}m`;
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pending-filter"
                  checked={showPendingOnly}
                  onCheckedChange={setShowPendingOnly}
                />
                <Label htmlFor="pending-filter" className="whitespace-nowrap">
                  Pending Treatments
                </Label>
              </div>
              {/* Pending treatments dropdown, visible only if switch is on */}
              {showPendingOnly && (
                <div className="min-w-[200px]">
                  <Select
                    value={pendingTreatmentFilter}
                    onValueChange={setPendingTreatmentFilter}
                  >
                    <SelectTrigger className="w-full border rounded-md px-3 py-2">
                      <SelectValue placeholder="All pending treatments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        All pending treatments
                      </SelectItem>
                      {/* Unique pending treatment names */}
                      {Array.from(
                        new Set(
                          Object.values(treatmentsByCattle)
                            .flat()
                            .filter((t: any) => t.completed === false)
                            .map((t: any) => t.treatment)
                        )
                      ).map((treatment: string) => (
                        <SelectItem key={treatment} value={treatment}>
                          {treatment}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 sm:mx-auto sm:w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cattleData.length === 0 && (
              <div className="col-span-full text-center py-4">
                No cattle found.
              </div>
            )}
            {cattleData.map((c: any) => (
              <div key={c.id}>
                <CattleCard cattle={c} />
              </div>
            ))}
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 my-6">
              <Button
                variant="outline"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      <Outlet />
    </>
  );
}
