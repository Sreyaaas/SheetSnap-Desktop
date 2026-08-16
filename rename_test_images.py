from pathlib import Path

TEST_INPUT_DIR = Path("test_images")

if not TEST_INPUT_DIR.exists():
    print(f"Directory {TEST_INPUT_DIR} does not exist.")
    exit(1)

# List all test files
supported_exts = [".jpg", ".jpeg", ".png", ".pdf"]
files = sorted([f for f in TEST_INPUT_DIR.iterdir() if f.suffix.lower() in supported_exts])

if not files:
    print(f"No image/PDF files found in {TEST_INPUT_DIR}")
    exit(0)

print(f"Found {len(files)} files in '{TEST_INPUT_DIR}'. Renaming logically...\n")

# Known content-based mapping keywords to assign clear names automatically
keywords_map = {
    "cat5": "zamil_po_cat5_cable",
    "screw": "zamil_po_screw_lubricant",
    "facility": "facility_cost_sheet",
    "density": "zoning_commercial_standards",
    "commercial": "zoning_commercial_standards",
    "wine": "wine_dataset_table",
    "csv": "wine_dataset_table",
    "armored": "single_po_armored_cable_205987",
    "diffuser": "single_po_lamp_diffuser_188015",
    "navtex": "multi_po_navtex_mold_cleaner_205988",
    "pearl": "yellow_po_lithium_battery_70981",
    "cold room": "yellow_po_thermometer_206037",
    "magnet": "yellow_po_magnet_rod_203786",
    "bell alarm": "dry_dock_bell_alarm_205973",
    "pad lock": "po_pad_lock_leonard_205800",
    "flexible": "po_flexible_cable_70860",
    "anu": "sample_invoice_anu"
}

for idx, file_path in enumerate(files, start=1):
    original_stem = file_path.stem.lower()
    ext = file_path.suffix.lower()
    
    # Check for recognized descriptive name
    matched_name = None
    for kw, descriptive_name in keywords_map.items():
        if kw in original_stem:
            matched_name = descriptive_name
            break
            
    if not matched_name:
        # Keep cleaned original name if not matched
        clean_stem = "".join(c if c.isalnum() or c in ['_', '-'] else '_' for c in file_path.stem)
        matched_name = f"doc_{clean_stem}"

    new_filename = f"{idx:02d}_{matched_name}{ext}"
    new_path = TEST_INPUT_DIR / new_filename

    # Rename
    if file_path != new_path:
        file_path.rename(new_path)
        print(f"  [Renamed] {file_path.name}  -->  {new_filename}")
    else:
        print(f"  [Kept]    {file_path.name}")

print("\n✅ All files renamed cleanly!")