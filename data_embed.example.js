const TIM_META = {
  "sosial": { "color": "orange" },
  "produksi": { "color": "blue" }
};

const TIMELINE_DATA = [
  {
    "id": "contoh_1",
    "kegiatan": "Survei Contoh 1",
    "tim": "sosial",
    "start": "2026-05-01",
    "end": "2026-05-15",
    "start_w": 18,
    "end_w": 20
  },
  {
    "id": "contoh_2",
    "kegiatan": "Pengolahan Data",
    "tim": "produksi",
    "start": "2026-05-16",
    "end": "2026-05-30",
    "start_w": 20,
    "end_w": 22
  }
];

// Provide it globally if needed
if (typeof window !== 'undefined') {
  window.TIM_META = TIM_META;
  window.TIMELINE_DATA = TIMELINE_DATA;
}
