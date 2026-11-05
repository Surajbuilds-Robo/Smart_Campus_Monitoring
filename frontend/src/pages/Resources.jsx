import { useState, useMemo } from "react";
import {
  MapPin,
  Search,
  Phone,
  Clock,
  Shield,
  HeartPulse,
  LifeBuoy,
  Building,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
  EmptyState,
} from "../components/ui";

const campusResources = [
  {
    id: "res-01",
    name: "Campus Security Command Center",
    category: "security",
    location: "Main Administrative Complex, Room 102",
    hours: "24/7 Operations",
    contact: "Ext. 2222 / (555) 019-2222",
    description: "Main dispatch for security patrol, lost & found, and CCTV incident review.",
    status: "active",
  },
  {
    id: "res-02",
    name: "Emergency Blue Light Stations (12 Campus Locations)",
    category: "emergency",
    location: "Campus Perimeter, Walkways, and Parking Lots A-E",
    hours: "24/7 Direct Line",
    contact: "One-Touch Call Button",
    description: "Instant two-way voice call box with location beacon and camera orientation.",
    status: "active",
  },
  {
    id: "res-03",
    name: "Campus Health & Urgent Care Center",
    category: "health",
    location: "Student Services Pavilion, Level 2",
    hours: "Mon - Fri: 08:00 - 20:00, Sat: 09:00 - 15:00",
    contact: "Ext. 4110 / (555) 019-4110",
    description: "First aid, licensed nursing care, triage, and emergency medical transport coordination.",
    status: "active",
  },
  {
    id: "res-04",
    name: "Automated External Defibrillator (AED) Stations",
    category: "health",
    location: "Library Lobby, Gymnasium, Science Hall 1st Floor",
    hours: "Building Operating Hours",
    contact: "Emergency Alarm Activated upon Access",
    description: "Public access defibrillation equipment with automated voice guidance.",
    status: "active",
  },
  {
    id: "res-05",
    name: "Facilities & Maintenance Operations",
    category: "desk",
    location: "North Service Depot, Building G",
    hours: "Mon - Sat: 07:00 - 19:00",
    contact: "Ext. 3300",
    description: "Reports for power outages, HVAC alerts, water leaks, and physical access locks.",
    status: "active",
  },
  {
    id: "res-06",
    name: "Department of Computer Science Operations Desk",
    category: "desk",
    location: "Turing Engineering Hall, Room 301",
    hours: "Mon - Fri: 08:30 - 17:30",
    contact: "Ext. 5501",
    description: "Departmental access passes, lab monitor credentials, and sensor queries.",
    status: "active",
  },
];

const categoryIcons = {
  security: Shield,
  emergency: LifeBuoy,
  health: HeartPulse,
  desk: Building,
};

export default function Resources() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredResources = useMemo(() => {
    return campusResources.filter((res) => {
      const matchesSearch =
        search === "" ||
        res.name.toLowerCase().includes(search.toLowerCase()) ||
        res.location.toLowerCase().includes(search.toLowerCase()) ||
        res.description.toLowerCase().includes(search.toLowerCase());

      const matchesCat =
        categoryFilter === "all" || res.category === categoryFilter;

      return matchesSearch && matchesCat;
    });
  }, [search, categoryFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campus Resources & Safety Directory"
        description="Emergency call boxes, medical stations, security desks, and facility operations"
        icon={MapPin}
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#806B6A]"
          />
          <input
            type="text"
            placeholder="Search resources by facility, service, or building..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#E5D6D6] bg-white py-2 pl-10 pr-4 text-sm text-[#3C1414] placeholder-[#806B6A] transition focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-[#E5D6D6] bg-white p-1 text-xs overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              categoryFilter === "all"
                ? "bg-[#B26262] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            All Services
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("emergency")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              categoryFilter === "emergency"
                ? "bg-[#C62828] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Emergency
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("security")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              categoryFilter === "security"
                ? "bg-[#B26262] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Security
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("health")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              categoryFilter === "health"
                ? "bg-[#287A43] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Health
          </button>
        </div>
      </div>

      {/* Resources Cards Grid */}
      {filteredResources.length === 0 ? (
        <EmptyState
          title="No campus resources found"
          description="Try broadening your search keywords or choosing 'All Services'."
          icon={MapPin}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredResources.map((res) => {
            const Icon = categoryIcons[res.category] || Building;

            return (
              <Card
                key={res.id}
                className="flex flex-col justify-between overflow-hidden transition hover:shadow-md"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        res.category === "emergency"
                          ? "bg-[#FDECEC] text-[#C62828]"
                          : res.category === "health"
                          ? "bg-[#E7F5EA] text-[#287A43]"
                          : res.category === "security"
                          ? "bg-[#F6EDED] text-[#B26262]"
                          : "bg-[#F6EDED] text-[#8C8C7C]"
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#3C1414]">{res.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {res.category.toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 space-y-3 text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    {res.description}
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <MapPin size={14} className="shrink-0 text-slate-400" />
                      <span>{res.location}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Clock size={14} className="shrink-0 text-slate-400" />
                      <span>{res.hours}</span>
                    </div>

                    <div className="flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400">
                      <Phone size={14} className="shrink-0" />
                      <span>{res.contact}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
