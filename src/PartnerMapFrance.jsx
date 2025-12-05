import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { motion } from "framer-motion";
import france from "@svg-maps/france.regions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "./supabaseClient"; // ou `import supabase from "./supabaseClient";` si export default

const STORAGE_KEY = "partner-map-france:v1";
const ADMIN_PASSWORD = "admin1234"; // 🔐 Mot de passe admin

// Palette Ubika
const UBIKA_PURPLE = "#7b2cbf"; // sélection
const UBIKA_TURQUOISE = "#00bfa6"; // hover
const UBIKA_BASE = "#b8a9c9"; // repos (lavande douce)

// Helper image -> dataURL (pour photo contact / logo)
async function fileToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Petit parseur CSV simple (séparateur , ou ;)
function parseCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(delimiter);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// Données d'exemple: 1 partenaire "Test" par région
const SAMPLE_DATA = {
  regions: france.locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    partners: [
      {
        name: "Test",
        city: loc.name,
        address: "1 rue Exemple",
        status: ["gold", "silver", "bronze"][Math.floor(Math.random() * 3)],
        logo: "",
        contacts: [],
        projects: [],
      },
    ],
  })),
};

// Normalisation des données (on s'aligne toujours sur la carte SVG)
function normalizeData(raw) {
  const existingRegions = Array.isArray(raw?.regions) ? raw.regions : [];

  const normalizedRegions = france.locations.map((loc) => {
    const match =
      existingRegions.find((r) => r.id === loc.id) ||
      existingRegions.find(
        (r) => (r.name || "").trim() === (loc.name || "").trim()
      );

    const base = match || {
      id: loc.id,
      name: loc.name,
      partners: [],
    };

    return {
      id: base.id || loc.id,
      name: base.name || loc.name,
      partners: (base.partners || []).map((p) => ({
        ...p,
        contacts: (p.contacts || []).map((c) => ({
          ...c,
          verticals: c.verticals || [],
          namedAccounts: c.namedAccounts || [],
          territory: c.territory || "",
        })),
        projects: p.projects || [],
      })),
    };
  });

  console.log("[NORMALIZE] données normalisées :", normalizedRegions);
  return { regions: normalizedRegions };
}

function FranceSvg({ onSelect, hoveredId, setHoveredId, selectedId }) {
  const vb = france.viewBox || "0 0 1096 915";
  const locations = france.locations;
  const pathRefs = useRef({});
  const [labelPos, setLabelPos] = useState({});

  useEffect(() => {
    const next = {};
    for (const loc of locations) {
      const el = pathRefs.current[loc.id];
      if (el && el.getBBox) {
        const b = el.getBBox();
        next[loc.id] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    setLabelPos(next);
  }, [locations]);

  return (
    <svg viewBox={vb} className="w-full h-full">
      {locations.map((loc) => {
        const id = loc.id;
        const isHovered = hoveredId === id;
        const isSelected = selectedId === id;
        const fill = isSelected
          ? UBIKA_PURPLE
          : isHovered
          ? UBIKA_TURQUOISE
          : UBIKA_BASE;
        return (
          <g key={id}>
            <motion.path
              ref={(el) => (pathRefs.current[id] = el)}
              d={loc.path}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(id)}
              fill={fill}
              stroke="#ffffff"
              strokeWidth="1.5"
              className="cursor-pointer transition-all duration-300"
              initial={{ opacity: 0.95 }}
              whileHover={{ scale: 1.01, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            />
            {labelPos[id] && (
              <text
                x={labelPos[id].x}
                y={labelPos[id].y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  pointerEvents: "none",
                  fill: "white",
                  stroke: "rgba(0,0,0,0.55)",
                  strokeWidth: 2,
                  paintOrder: "stroke fill",
                }}
              >
                {loc.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function AddContactInline({ onAdd }) {
  const [form, setForm] = useState({
    photo: "",
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    phone: "",
    verticals: "",
    namedAccounts: "",
    territory: "",
  });

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file, 220);
    setForm((f) => ({ ...f, photo: dataUrl }));
  };

  return (
    <div className="space-y-3 mt-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer?.files || null);
        }}
        className="border border-dashed rounded-xl p-3 text-sm text-center cursor-pointer"
        onClick={() =>
          document.getElementById("contact-photo-input")?.click()
        }
      >
        {form.photo ? (
          <div className="flex items-center gap-3 justify-center">
            <img
              src={form.photo}
              alt="aperçu"
              className="h-12 w-12 rounded-full object-cover border"
            />
            <span>Remplacer la photo (glisser-déposer ou cliquer)</span>
          </div>
        ) : (
          <span>Glisse une photo ici ou clique pour choisir…</span>
        )}
      </div>
      <input
        id="contact-photo-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="border rounded px-2 py-1 text-gray-900"
          placeholder="Prénom"
          value={form.firstName}
          onChange={(e) =>
            setForm({ ...form, firstName: e.target.value })
          }
        />
        <input
          className="border rounded px-2 py-1 text-gray-900"
          placeholder="Nom"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </div>
      <input
        className="border rounded px-2 py-1 w-full text-gray-900"
        placeholder="Poste"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <input
        className="border rounded px-2 py-1 w-full text-gray-900"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <input
        className="border rounded px-2 py-1 w-full text-gray-900"
        placeholder="Téléphone"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />

      <input
        className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
        placeholder="Verticals (séparés par des virgules) ex: Industrie, Public"
        value={form.verticals}
        onChange={(e) =>
          setForm({ ...form, verticals: e.target.value })
        }
      />
      <input
        className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
        placeholder="Comptes nommés (séparés par des virgules)"
        value={form.namedAccounts}
        onChange={(e) =>
          setForm({ ...form, namedAccounts: e.target.value })
        }
      />
      <input
        className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
        placeholder="Zone (ex: Sud, IDF, National)"
        value={form.territory}
        onChange={(e) =>
          setForm({ ...form, territory: e.target.value })
        }
      />

      <button
        className="w-full rounded-lg bg-purple-600 text-white px-3 py-2 text-sm font-medium hover:bg-purple-700"
        onClick={() => {
          if (
            form.firstName ||
            form.lastName ||
            form.email ||
            form.phone
          ) {
            onAdd(form);
            setForm({
              photo: "",
              firstName: "",
              lastName: "",
              title: "",
              email: "",
              phone: "",
              verticals: "",
              namedAccounts: "",
              territory: "",
            });
          }
        }}
      >
        Ajouter le contact
      </button>
    </div>
  );
}

function AddContactDialog({ onAdd }) {
  const [open, setOpen] = useState(false);

  const normalizeListLocal = (s) =>
    (s || "")
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="rounded-lg bg-purple-600 text-white px-3 py-2 text-sm font-semibold hover:bg-purple-700">
          Créer un nouveau contact
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
        </DialogHeader>
        <AddContactInline
          onAdd={(c) => {
            const payload = {
              photo: c.photo,
              firstName: c.firstName,
              lastName: c.lastName,
              title: c.title,
              email: c.email,
              phone: c.phone,
              verticals: normalizeListLocal(c.verticals),
              namedAccounts: normalizeListLocal(c.namedAccounts),
              territory: (c.territory || "").trim(),
            };
            onAdd(payload);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// === Création projet ===
function AddProjectDialog({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "En cours",
    icName: "",
  });

  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="rounded-lg border border-purple-700 bg-white px-3 py-2 text-sm font-semibold hover:bg-purple-50 text-purple-700">
          Ajouter un projet
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <input
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Nom du projet *"
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <textarea
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Description (facultatif)"
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded px-2 py-1 text-gray-900"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="En cours">En cours</option>
              <option value="Gagné">Gagné</option>
              <option value="Perdu">Perdu</option>
              <option value="Pause">Pause</option>
            </select>
            <input
              className="border rounded px-2 py-1 text-gray-900"
              placeholder="IC associé (texte libre)"
              value={form.icName}
              onChange={(e) =>
                setForm((f) => ({ ...f, icName: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              disabled={!canSave}
              className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-purple-700"
              onClick={() => {
                onAdd(form);
                setOpen(false);
                setForm({
                  name: "",
                  description: "",
                  status: "En cours",
                  icName: "",
                });
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddPartnerDialog({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    status: "silver",
    logo: "",
  });

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, 220);
      setForm((f) => ({ ...f, logo: dataUrl }));
    } catch {}
  };

  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="rounded-lg border border-purple-700 bg-white px-3 py-2 text-sm font-semibold hover:bg-purple-50 !text-purple-700"
          style={{ color: "#6B21A8" }}
        >
          Ajouter un partenaire
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau partenaire</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer?.files || null);
            }}
            className="border border-dashed rounded-lg p-3 text-sm text-center cursor-pointer"
            onClick={() =>
              document.getElementById("partner-logo-input")?.click()
            }
          >
            {form.logo ? (
              <div className="flex items-center gap-3 justify-center">
                <img
                  src={form.logo}
                  alt="logo"
                  className="h-12 w-12 rounded bg-white border object-contain"
                />
                <span>Remplacer le logo (glisser-déposer ou cliquer)</span>
              </div>
            ) : (
              <span>Glisse un logo ici ou clique pour choisir…</span>
            )}
          </div>
          <input
            id="partner-logo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Nom *"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Adresse"
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Ville"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />
          <select
            className="border rounded px-2 py-1 text-gray-900"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value })
            }
          >
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              disabled={!canSave}
              className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-purple-700"
              onClick={() => {
                onAdd({ ...form });
                setOpen(false);
                setForm({
                  name: "",
                  address: "",
                  city: "",
                  status: "silver",
                  logo: "",
                });
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Import CSV global
function ImportCsvDialog({ onImport }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const rows = parseCsv(text);
        if (!rows.length) {
          setError("Aucune ligne valide détectée dans le fichier.");
          return;
        }
        onImport(rows);
        setError("");
        setOpen(false);
      } catch (e) {
        console.error(e);
        setError("Erreur lors de la lecture du fichier.");
      }
    };
    reader.onerror = () => {
      setError("Impossible de lire le fichier.");
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) setError("");
      }}
    >
      <DialogTrigger asChild>
        <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 text-gray-800">
          Importer CSV
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importer des partenaires / contacts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Exemple minimal de colonnes :</p>
          <pre className="bg-gray-100 rounded-md p-2 text-xs overflow-x-auto">
region,partner,city,address,status,firstName,lastName,title,email,phone,account
          </pre>
          <p className="text-xs text-gray-500">
            Tu peux aussi utiliser <code>accounts</code>,{" "}
            <code>namedAccounts</code> avec plusieurs comptes séparés par
            virgules ou point-virgule.
          </p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer?.files || null);
            }}
            className="border border-dashed rounded-lg p-4 text-center cursor-pointer"
            onClick={() =>
              document.getElementById("csv-import-input")?.click()
            }
          >
            Glisse ton fichier ici ou clique pour parcourir…
          </div>
          <input
            id="csv-import-input"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-gray-500">
            Les lignes sont associées aux régions via la colonne{" "}
            <code>region</code> (nom affiché sur la carte).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPartnerDialog({ partner, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: partner.name || "",
    address: partner.address || "",
    city: partner.city || "",
    status: partner.status || "silver",
    logo: partner.logo || "",
  });

  useEffect(() => {
    setForm({
      name: partner.name || "",
      address: partner.address || "",
      city: partner.city || "",
      status: partner.status || "silver",
      logo: partner.logo || "",
    });
  }, [partner]);

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, 220);
      setForm((f) => ({ ...f, logo: dataUrl }));
    } catch {}
  };

  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          title="Modifier ce partenaire"
        >
          {/* Icône crayon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793z" />
            <path d="M4 13.5V16h2.5l7.086-7.086-2.828-2.828L4 13.5z" />
          </svg>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Modifier le partenaire</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer?.files || null);
            }}
            className="border border-dashed rounded-lg p-3 text-sm text-center cursor-pointer"
            onClick={() =>
              document.getElementById("edit-partner-logo-input")?.click()
            }
          >
            {form.logo ? (
              <div className="flex items-center gap-3 justify-center">
                <img
                  src={form.logo}
                  alt="logo"
                  className="h-12 w-12 rounded bg-white border object-contain"
                />
                <span>Remplacer le logo (glisser-déposer ou cliquer)</span>
              </div>
            ) : (
              <span>Glisse un logo ici ou clique pour choisir…</span>
            )}
          </div>
          <input
            id="edit-partner-logo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Nom *"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Adresse"
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 text-gray-900"
            placeholder="Ville"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />
          <select
            className="border rounded px-2 py-1 text-gray-900"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value })
            }
          >
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              disabled={!canSave}
              className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-purple-700"
              onClick={() => {
                onSave({ ...form });
                setOpen(false);
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({ contact, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    photo: contact.photo || "",
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
    verticalsText: (contact.verticals || []).join(", "),
    namedAccountsText: (contact.namedAccounts || []).join(", "),
    territory: contact.territory || "",
  });

  useEffect(() => {
    setForm({
      photo: contact.photo || "",
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      verticalsText: (contact.verticals || []).join(", "),
      namedAccountsText: (contact.namedAccounts || []).join(", "),
      territory: contact.territory || "",
    });
  }, [contact]);

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file, 220);
    setForm((f) => ({ ...f, photo: dataUrl }));
  };

  const canSave =
    form.firstName.trim().length > 0 ||
    form.lastName.trim().length > 0 ||
    form.email.trim().length > 0 ||
    form.phone.trim().length > 0 ||
    form.verticalsText.trim().length > 0 ||
    form.namedAccountsText.trim().length > 0 ||
    form.territory.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          title="Modifier ce contact"
        >
          {/* Crayon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793z" />
            <path d="M4 13.5V16h2.5l7.086-7.086-2.828-2.828L4 13.5z" />
          </svg>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer?.files || null);
            }}
            className="border border-dashed rounded-xl p-3 text-sm text-center cursor-pointer"
            onClick={() =>
              document.getElementById("edit-contact-photo-input")?.click()
            }
          >
            {form.photo ? (
              <div className="flex items-center gap-3 justify-center">
                <img
                  src={form.photo}
                  alt="aperçu"
                  className="h-12 w-12 rounded-full object-cover border"
                />
                <span>Remplacer la photo (glisser-déposer ou cliquer)</span>
              </div>
            ) : (
              <span>Glisse une photo ici ou clique pour choisir…</span>
            )}
          </div>
          <input
            id="edit-contact-photo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded px-2 py-1 text-gray-900"
              placeholder="Prénom"
              value={form.firstName}
              onChange={(e) =>
                setForm({ ...form, firstName: e.target.value })
              }
            />
            <input
              className="border rounded px-2 py-1 text-gray-900"
              placeholder="Nom"
              value={form.lastName}
              onChange={(e) =>
                setForm({ ...form, lastName: e.target.value })
              }
            />
          </div>
          <input
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Poste"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Téléphone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
            placeholder="Verticals (séparés par des virgules)"
            value={form.verticalsText}
            onChange={(e) =>
              setForm({ ...form, verticalsText: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
            placeholder="Comptes nommés (séparés par des virgules)"
            value={form.namedAccountsText}
            onChange={(e) =>
              setForm({ ...form, namedAccountsText: e.target.value })
            }
          />
          <input
            className="border rounded px-2 py-1 w-full text-gray-900 text-xs"
            placeholder="Zone (ex: Sud, IDF, National)"
            value={form.territory}
            onChange={(e) =>
              setForm({ ...form, territory: e.target.value })
            }
          />

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              disabled={!canSave}
              className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-purple-700"
              onClick={() => {
                const payload = {
                  photo: form.photo,
                  firstName: form.firstName,
                  lastName: form.lastName,
                  title: form.title,
                  email: form.email,
                  phone: form.phone,
                  verticals: normalizeList(form.verticalsText),
                  namedAccounts: normalizeList(form.namedAccountsText),
                  territory: (form.territory || "").trim(),
                };
                onSave(payload);
                setOpen(false);
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// helper global
function normalizeList(str) {
  return (str || "")
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// Édition projet
function EditProjectDialog({ project, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: project.name || "",
    description: project.description || "",
    status: project.status || "En cours",
    icName: project.icName || "",
  });

  useEffect(() => {
    setForm({
      name: project.name || "",
      description: project.description || "",
      status: project.status || "En cours",
      icName: project.icName || "",
    });
  }, [project]);

  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          title="Modifier ce projet"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793z" />
            <path d="M4 13.5V16h2.5l7.086-7.086-2.828-2.828L4 13.5z" />
          </svg>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le projet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm mt-2">
          <input
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Nom du projet *"
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <textarea
            className="border rounded px-2 py-1 w-full text-gray-900"
            placeholder="Description"
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded px-2 py-1 text-gray-900"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="En cours">En cours</option>
              <option value="Gagné">Gagné</option>
              <option value="Perdu">Perdu</option>
              <option value="Pause">Pause</option>
            </select>
            <input
              className="border rounded px-2 py-1 text-gray-900"
              placeholder="IC associé"
              value={form.icName}
              onChange={(e) =>
                setForm((f) => ({ ...f, icName: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button
              disabled={!canSave}
              className="rounded-lg bg-purple-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-purple-700"
              onClick={() => {
                onSave({ ...form });
                setOpen(false);
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PartnerMapFrance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [activePartnerIndex, setActivePartnerIndex] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  // Chargement initial depuis Supabase (avec fallback localStorage/SAMPLE_DATA)
  useEffect(() => {
    async function load() {
      console.log("[LOAD] Début du chargement…");
      try {
        const { data: row, error } = await supabase
          .from("partner_map")
          .select("data")
          .eq("id", "france")
          .single();

        console.log("[LOAD] Résultat Supabase:", { row, error });

        if (error) {
          console.error("[LOAD] Erreur Supabase:", error);
          setLoadError("Erreur de chargement Supabase");

          // Fallback localStorage
          try {
            if (typeof window !== "undefined") {
              const raw = window.localStorage.getItem(STORAGE_KEY);
              if (raw) {
                console.log("[LOAD] Chargement depuis localStorage");
                const parsed = JSON.parse(raw);
                setData(normalizeData(parsed));
                setLoading(false);
                return;
              }
            }
          } catch (e) {
            console.error("[LOAD] Erreur localStorage:", e);
          }

          console.log("[LOAD] Fallback SAMPLE_DATA");
          setData(normalizeData(SAMPLE_DATA));
          setLoading(false);
          return;
        }

        if (row?.data) {
          console.log("[LOAD] Données Supabase trouvées, normalisation…");
          setData(normalizeData(row.data));
        } else {
          console.log("[LOAD] Aucune ligne Supabase, utilisation SAMPLE_DATA");
          setData(normalizeData(SAMPLE_DATA));
        }
      } catch (e) {
        console.error("[LOAD] Exception Supabase:", e);
        setLoadError("Erreur de chargement");
        setData(normalizeData(SAMPLE_DATA));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Sauvegarde vers Supabase + backup localStorage
  useEffect(() => {
    if (!data) return;

    console.log("[SAVE] data modifiée, lancement de la sauvegarde…", data);

    async function save() {
      try {
        const { error } = await supabase
          .from("partner_map")
          .upsert(
            { id: "france", data },
            { onConflict: "id" }
          );

        if (error) {
          console.error("[SAVE] Erreur Supabase save:", error);
        } else {
          console.log("[SAVE] Supabase OK");
        }
      } catch (e) {
        console.error("[SAVE] Exception Supabase save:", e);
      }

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          console.log("[SAVE] localStorage OK");
        }
      } catch (e) {
        console.error("[SAVE] Erreur localStorage:", e);
      }
    }

    save();
  }, [data]);

  // selectedRegion robuste : par id puis par nom si besoin
  const selectedRegion = useMemo(() => {
    if (!data || !selectedRegionId) return null;

    const byId = data.regions.find((r) => r.id === selectedRegionId);
    if (byId) return byId;

    const loc = france.locations.find((l) => l.id === selectedRegionId);
    if (!loc) return null;

    const byName = data.regions.find(
      (r) => (r.name || "").trim() === (loc.name || "").trim()
    );
    return byName || null;
  }, [data, selectedRegionId]);

  const activePartner =
    selectedRegion && activePartnerIndex !== null
      ? selectedRegion.partners[activePartnerIndex]
      : null;

  const handleToggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      const pwd = window.prompt("Mot de passe admin ?");
      if (pwd === null) return;
      if (pwd === ADMIN_PASSWORD) {
        setIsAdmin(true);
      } else {
        window.alert("Mot de passe incorrect");
      }
    }
  };

  const handleDeletePartner = (partnerIndex) => {
    if (!selectedRegion || !data) return;

    const partner = selectedRegion.partners[partnerIndex];
    if (!partner) return;

    const ok = window.confirm(
      `Supprimer le partenaire "${partner.name}" ?`
    );
    if (!ok) return;

    setData((prev) => ({
      regions: prev.regions.map((r) => {
        if (r.id !== selectedRegion.id) return r;
        const newPartners = r.partners.filter((_, i) => i !== partnerIndex);
        return { ...r, partners: newPartners };
      }),
    }));

    setActivePartnerIndex((prev) => {
      if (prev === null) return null;
      if (prev === partnerIndex) return null;
      if (prev > partnerIndex) return prev - 1;
      return prev;
    });
  };

  const handleDeleteContact = (contactIndex) => {
    if (!activePartner || !selectedRegion || !data) return;

    const contact = activePartner.contacts?.[contactIndex];
    if (!contact) return;

    const ok = window.confirm(
      `Supprimer le contact "${contact.firstName} ${contact.lastName}" ?`
    );
    if (!ok) return;

    setData((prev) => ({
      regions: prev.regions.map((r) => {
        if (r.id !== selectedRegion.id) return r;

        const newPartners = r.partners.map((p, i) => {
          if (i !== activePartnerIndex) return p;
          return {
            ...p,
            contacts: p.contacts.filter((_, j) => j !== contactIndex),
          };
        });

        return { ...r, partners: newPartners };
      }),
    }));
  };

  const handleDeleteProject = (projectIndex) => {
    if (!activePartner || !selectedRegion || !data) return;

    const project = activePartner.projects?.[projectIndex];
    if (!project) return;

    const ok = window.confirm(
      `Supprimer le projet "${project.name}" ?`
    );
    if (!ok) return;

    setData((prev) => ({
      regions: prev.regions.map((r) => {
        if (r.id !== selectedRegion.id) return r;

        const newPartners = r.partners.map((p, i) => {
          if (i !== activePartnerIndex) return p;
          return {
            ...p,
            projects: p.projects.filter((_, j) => j !== projectIndex),
          };
        });

        return { ...r, partners: newPartners };
      }),
    }));
  };

  // Recherche globale de projets
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q || !data) return [];
    const results = [];

    data.regions.forEach((region) => {
      region.partners.forEach((partner, partnerIndex) => {
        (partner.projects || []).forEach((project) => {
          if ((project.name || "").toLowerCase().includes(q)) {
            results.push({
              project,
              partner,
              region,
              partnerIndex,
            });
          }
        });
      });
    });

    return results;
  }, [data, projectSearch]);

  // Recherche globale par compte nommé (utilise namedAccounts des contacts)
  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q || !data) return [];
    const results = [];

    data.regions.forEach((region) => {
      region.partners.forEach((partner, partnerIndex) => {
        (partner.contacts || []).forEach((contact) => {
          (contact.namedAccounts || []).forEach((accName) => {
            if ((accName || "").toLowerCase().includes(q)) {
              results.push({
                accountName: accName,
                contact,
                partner,
                region,
                partnerIndex,
              });
            }
          });
        });
      });
    });

    return results;
  }, [data, accountSearch]);

  // Import CSV avec prise en compte des comptes nommés
  const handleImportCsv = (rows) => {
    if (!data) return;
    setData((prev) => {
      const nextRegions = prev.regions.map((r) => {
        const rowsForRegion = rows.filter((row) => {
          const rn = row.region || row.Region || "";
          return rn.trim() === (r.name || "").trim();
        });
        if (!rowsForRegion.length) return r;

        let partners = [...r.partners];

        rowsForRegion.forEach((row) => {
          const partnerName =
            row.partner || row.PARTNER || row.Partner || "";
          if (!partnerName) return;

          let idx = partners.findIndex(
            (p) => (p.name || "").trim() === partnerName.trim()
          );
          if (idx === -1) {
            partners.push({
              name: partnerName,
              city: row.city || row.City || "",
              address: row.address || row.Address || "",
              status: row.status || row.Status || "silver",
              logo: "",
              contacts: [],
              projects: [],
            });
            idx = partners.length - 1;
          }

          let contacts = partners[idx].contacts || [];

          const baseContact = {
            photo: "",
            firstName:
              row.firstName ||
              row.firstname ||
              row.FirstName ||
              "",
            lastName:
              row.lastName ||
              row.lastname ||
              row.LastName ||
              "",
            title: row.title || row.Title || "",
            email: row.email || row.Email || "",
            phone: row.phone || row.Phone || "",
          };

          const accountsRaw =
            row.account ||
            row.Account ||
            row.accounts ||
            row.Accounts ||
            row.namedAccounts ||
            row.NamedAccounts ||
            "";
          const accountsList = (accountsRaw || "")
            .split(/[;,]/)
            .map((v) => v.trim())
            .filter(Boolean);

          if (
            !baseContact.firstName &&
            !baseContact.lastName &&
            !baseContact.email &&
            !baseContact.phone &&
            !accountsList.length
          ) {
            return;
          }

          let matchIndex = contacts.findIndex((c) => {
            if (baseContact.email && c.email) {
              return (
                c.email.trim().toLowerCase() ===
                baseContact.email.trim().toLowerCase()
              );
            }
            if (
              baseContact.firstName &&
              baseContact.lastName &&
              c.firstName &&
              c.lastName
            ) {
              return (
                c.firstName.trim().toLowerCase() ===
                  baseContact.firstName.trim().toLowerCase() &&
                c.lastName.trim().toLowerCase() ===
                  baseContact.lastName.trim().toLowerCase()
              );
            }
            return false;
          });

          if (matchIndex === -1) {
            contacts = [
              ...contacts,
              {
                ...baseContact,
                verticals: [],
                namedAccounts: accountsList,
                territory: "",
              },
            ];
          } else {
            const existing = contacts[matchIndex];

            const updated = { ...existing };
            ["firstName", "lastName", "title", "email", "phone"].forEach(
              (field) => {
                if (baseContact[field]) {
                  updated[field] = baseContact[field];
                }
              }
            );

            const mergedAccounts = [
              ...(existing.namedAccounts || []),
              ...accountsList,
            ]
              .map((a) => a.trim())
              .filter(Boolean);

            const uniqueLower = [
              ...new Set(mergedAccounts.map((a) => a.toLowerCase())),
            ];

            const uniqueAccounts = uniqueLower.map((lower) =>
              mergedAccounts.find((a) => a.toLowerCase() === lower)
            );

            updated.namedAccounts = uniqueAccounts;

            contacts = contacts.map((c, ci) =>
              ci === matchIndex ? updated : c
            );
          }

          partners[idx] = {
            ...partners[idx],
            contacts,
          };
        });

        return { ...r, partners };
      });

      return { regions: nextRegions };
    });
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f5f0fa] to-[#e8f9f6]">
        <div className="rounded-2xl border bg-white shadow-md px-6 py-4 text-sm text-gray-700">
          Chargement des données partenaires…
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f0fa] to-[#e8f9f6] p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Header global */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-[#5a189a]">
            Carte des partenaires
          </h1>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Rechercher un projet…"
                className="rounded-full border px-3 py-1.5 text-xs text-gray-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                style={{ minWidth: "200px" }}
              />
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Rechercher un compte nommé…"
                className="rounded-full border px-3 py-1.5 text-xs text-gray-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                style={{ minWidth: "220px" }}
              />
            </div>

            {isAdmin && <ImportCsvDialog onImport={handleImportCsv} />}

            <button
              onClick={handleToggleAdmin}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold bg-white hover:bg-gray-100 shadow-sm !text-gray-900"
              style={{ color: "#111827" }}
            >
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  isAdmin ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {isAdmin ? "Mode admin" : "Lecture seule"}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="text-xs text-red-600">
            {loadError} (données locales utilisées en secours)
          </div>
        )}

        {/* Résultats recherche projets */}
        {projectSearch.trim() && (
          <div className="rounded-xl border bg-white shadow-sm p-3 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-800">
                Projets correspondant à “{projectSearch}”
              </span>
              <span className="text-gray-500">
                {filteredProjects.length} projet
                {filteredProjects.length > 1 ? "s" : ""}
              </span>
            </div>
            {filteredProjects.length === 0 ? (
              <p className="text-gray-500">
                Aucun projet trouvé correspondant à cette recherche.
              </p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-auto pr-1">
                {filteredProjects.map(
                  ({ project, partner, region, partnerIndex }, idx) => (
                    <li
                      key={`${region.id}-${partnerIndex}-${project.name}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        setSelectedRegionId(region.id);
                        setActivePartnerIndex(partnerIndex);
                      }}
                    >
                      <div>
                        <div className="font-semibold text-gray-800">
                          {project.name}
                        </div>
                        <div className="text-gray-600">
                          {partner.name} · {region.name}
                        </div>
                        {project.icName && (
                          <div className="text-gray-500">
                            IC : {project.icName}
                          </div>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                        {project.status || "En cours"}
                      </span>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        )}

        {/* Résultats recherche comptes nommés */}
        {accountSearch.trim() && (
          <div className="rounded-xl border bg-white shadow-sm p-3 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-800">
                Comptes nommés correspondant à “{accountSearch}”
              </span>
              <span className="text-gray-500">
                {filteredAccounts.length} résultat
                {filteredAccounts.length > 1 ? "s" : ""}
              </span>
            </div>
            {filteredAccounts.length === 0 ? (
              <p className="text-gray-500">
                Aucun compte nommé trouvé correspondant à cette recherche.
              </p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-auto pr-1">
                {filteredAccounts.map(
                  (
                    { accountName, contact, partner, region, partnerIndex },
                    idx
                  ) => (
                    <li
                      key={`${region.id}-${partnerIndex}-${accountName}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        setSelectedRegionId(region.id);
                        setActivePartnerIndex(partnerIndex);
                      }}
                    >
                      <div>
                        <div className="font-semibold text-gray-800">
                          {accountName}
                        </div>
                        <div className="text-gray-600">
                          {partner.name} · {region.name}
                        </div>
                        <div className="text-gray-600">
                          Contact : {contact.firstName} {contact.lastName}
                          {contact.territory
                            ? ` · Zone : ${contact.territory}`
                            : ""}
                        </div>
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Carte France */}
          <div className="rounded-2xl border bg-white shadow-md p-4 relative">
            <FranceSvg
              onSelect={(id) => {
                setSelectedRegionId(id);
                setActivePartnerIndex(null);
              }}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              selectedId={selectedRegionId}
            />
          </div>

          {/* Panneau de droite */}
          <div className="rounded-2xl border bg-white shadow-md p-4">
            {selectedRegion ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[#5a189a]">
                    {selectedRegion.name}
                  </h2>
                  {isAdmin && (
                    <AddPartnerDialog
                      onAdd={(partner) => {
                        setData((prev) => ({
                          regions: prev.regions.map((r) =>
                            r.id === selectedRegion.id
                              ? {
                                  ...r,
                                  partners: [
                                    ...r.partners,
                                    {
                                      ...partner,
                                      contacts: [],
                                      projects: [],
                                    },
                                  ],
                                }
                              : r
                          ),
                        }));
                      }}
                    />
                  )}
                </div>

                {/* Liste des partenaires */}
                <ul className="space-y-2">
                  {selectedRegion.partners.map((p, index) => (
                    <li key={index}>
                      <div
                        onClick={() => setActivePartnerIndex(index)}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 shadow-sm hover:shadow-md transition cursor-pointer ${
                          activePartnerIndex === index
                            ? "bg-gray-100"
                            : "bg-white"
                        }`}
                      >
                        <div className="flex items-center flex-wrap gap-2">
                          {p.logo && (
                            <img
                              src={p.logo}
                              alt="logo"
                              className="h-6 w-6 rounded bg-white border object-contain"
                            />
                          )}
                          <span className="font-semibold text-gray-900">
                            {p.name}
                          </span>
                          {p.city && (
                            <span className="text-sm text-gray-700">
                              • {p.city}
                            </span>
                          )}
                          {p.address && (
                            <span className="text-sm text-gray-700">
                              • {p.address}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              p.status === "gold"
                                ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                                : p.status === "silver"
                                ? "bg-gray-100 text-gray-700 border-gray-300"
                                : "bg-orange-200 text-orange-900 border-orange-400"
                            }`}
                          >
                            {p.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {Array.isArray(p.contacts)
                              ? p.contacts.length
                              : 0}{" "}
                            contacts
                          </span>
                          <span className="text-xs text-gray-500">
                            {Array.isArray(p.projects)
                              ? p.projects.length
                              : 0}{" "}
                            projets
                          </span>

                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <EditPartnerDialog
                                partner={p}
                                onSave={(updated) => {
                                  setData((prev) => ({
                                    regions: prev.regions.map((r) => {
                                      if (r.id !== selectedRegion.id)
                                        return r;
                                      const partners = r.partners.map(
                                        (pp, i) =>
                                          i === index
                                            ? { ...pp, ...updated }
                                            : pp
                                      );
                                      return { ...r, partners };
                                    }),
                                  }));
                                }}
                              />

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePartner(index);
                                }}
                                className="p-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                                title="Supprimer ce partenaire"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2h12a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM5 6a1 1 0 011 1v9a2 2 0 002 2h4a2 2 0 002-2V7a1 1 1 112 0v9a4 4 0 01-4 4H8a4 4 0 01-4-4V7a1 1 0 011-1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Panneau contacts + projets du partenaire actif */}
                {activePartner && (
                  <div className="mt-4 rounded-xl border p-4 bg-white space-y-4">
                    {/* Contacts */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Contacts — {activePartner.name}
                      </h3>
                      {activePartner.contacts?.length ? (
                        <div className="grid grid-cols-1 gap-2 mb-3">
                          {activePartner.contacts.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"
                            >
                              <div className="flex items-start gap-3">
                                {c.photo ? (
                                  <img
                                    src={c.photo}
                                    alt="photo"
                                    className="h-10 w-10 rounded-full object-cover border"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full border bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                                    IMG
                                  </div>
                                )}
                                <div className="text-sm space-y-0.5">
                                  <div className="font-semibold text-gray-900">
                                    {c.firstName} {c.lastName}
                                  </div>
                                  <div className="text-gray-700">
                                    {c.title}
                                  </div>
                                  <div className="text-gray-700">
                                    {c.email && (
                                      <a
                                        href={`mailto:${c.email}`}
                                        className="underline"
                                      >
                                        {c.email}
                                      </a>
                                    )}
                                    {c.email && c.phone ? " • " : ""}
                                    {c.phone}
                                  </div>
                                  {c.verticals &&
                                    c.verticals.length > 0 && (
                                      <div className="text-[11px] text-gray-600">
                                        Verticals :{" "}
                                        {c.verticals.join(", ")}
                                      </div>
                                    )}
                                  {c.territory && (
                                    <div className="text-[11px] text-gray-500">
                                      Zone : {c.territory}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <EditContactDialog
                                    contact={c}
                                    onSave={(updated) => {
                                      setData((prev) => ({
                                        regions: prev.regions.map((r) => {
                                          if (
                                            r.id !== selectedRegion.id
                                          )
                                            return r;
                                          const partners =
                                            r.partners.map((p2, pi) => {
                                              if (
                                                pi !== activePartnerIndex
                                              )
                                                return p2;
                                              const newContacts =
                                                p2.contacts.map(
                                                  (cc, ci) =>
                                                    ci === i
                                                      ? {
                                                          ...cc,
                                                          ...updated,
                                                        }
                                                      : cc
                                                );
                                              return {
                                                ...p2,
                                                contacts: newContacts,
                                              };
                                            });
                                          return { ...r, partners };
                                        }),
                                      }));
                                    }}
                                  />

                                  <button
                                    onClick={() =>
                                      handleDeleteContact(i)
                                    }
                                    className="p-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                                    title="Supprimer ce contact"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2h12a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM5 6a1 1 0 011 1v9a2 2 0 002 2h4a2 2 0 002-2V7a1 1 1 112 0v9a4 4 0 01-4 4H8a4 4 0 01-4-4V7a1 1 0 011-1z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 mb-3">
                          Aucun contact pour l’instant.
                        </div>
                      )}
                    </div>

                    {/* Projets */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Projets — {activePartner.name}
                      </h3>
                      {activePartner.projects?.length ? (
                        <div className="space-y-2 mb-2">
                          {activePartner.projects.map((proj, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm"
                            >
                              <div>
                                <div className="font-semibold text-gray-900">
                                  {proj.name}
                                </div>
                                {proj.icName && (
                                  <div className="text-gray-700">
                                    IC : {proj.icName}
                                  </div>
                                )}
                                {proj.description && (
                                  <div className="text-xs text-gray-600 mt-0.5">
                                    {proj.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                  {proj.status || "En cours"}
                                </span>
                                {isAdmin && (
                                  <div className="flex items-center gap-1">
                                    <EditProjectDialog
                                      project={proj}
                                      onSave={(updated) => {
                                        setData((prev) => ({
                                          regions: prev.regions.map(
                                            (r) => {
                                              if (
                                                r.id !==
                                                selectedRegion.id
                                              )
                                                return r;
                                              const partners =
                                                r.partners.map(
                                                  (p2, pi) => {
                                                    if (
                                                      pi !==
                                                      activePartnerIndex
                                                    )
                                                      return p2;
                                                    const newProjects =
                                                      p2.projects.map(
                                                        (ppj, pji) =>
                                                          pji === i
                                                            ? {
                                                                ...ppj,
                                                                ...updated,
                                                              }
                                                            : ppj
                                                      );
                                                    return {
                                                      ...p2,
                                                      projects:
                                                        newProjects,
                                                    };
                                                  }
                                                );
                                              return { ...r, partners };
                                            }
                                          ),
                                        }));
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        handleDeleteProject(i)
                                      }
                                      className="p-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                                      title="Supprimer ce projet"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                      >
                                        <path
                                          fillRule="evenodd"
                                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2h12a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM5 6a1 1 0 011 1v9a2 2 0 002 2h4a2 2 0 002-2V7a1 1 1 112 0v9a4 4 0 01-4 4H8a4 4 0 01-4-4V7a1 1 0 011-1z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 mb-1">
                          Aucun projet associé pour ce partenaire.
                        </div>
                      )}
                    </div>

                    {/* Boutons création contact / projet */}
                    {isAdmin && (
                      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-dashed mt-1">
                        <AddProjectDialog
                          onAdd={(project) => {
                            if (!activePartner) return;
                            setData((prev) => ({
                              regions: prev.regions.map((r) => {
                                if (r.id !== selectedRegion.id) return r;
                                const partners = r.partners.map(
                                  (pp, pi) =>
                                    pi === activePartnerIndex
                                      ? {
                                          ...pp,
                                          projects: [
                                            ...(pp.projects || []),
                                            project,
                                          ],
                                        }
                                      : pp
                                );
                                return { ...r, partners };
                              }),
                            }));
                          }}
                        />
                        <AddContactDialog
                          onAdd={(contact) => {
                            if (!activePartner) return;
                            setData((prev) => ({
                              regions: prev.regions.map((r) => {
                                if (r.id !== selectedRegion.id) return r;
                                const partners = r.partners.map(
                                  (pp, pi) =>
                                    pi === activePartnerIndex
                                      ? {
                                          ...pp,
                                          contacts: [
                                            ...(pp.contacts || []),
                                            contact,
                                          ],
                                        }
                                      : pp
                                );
                                return { ...r, partners };
                              }),
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Clique sur une région pour afficher les partenaires.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
