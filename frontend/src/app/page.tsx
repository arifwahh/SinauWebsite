'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, resolveMediaUrl } from '@/lib/api';
import { LEVEL_LABELS, errorMessage, formatPrice, getLevelLabel } from '@/lib/format';
import type { Category, Course } from '@/lib/types';
import StatsCard from '@/components/stats-card';
import CategoryCard from '@/components/category-card';
import CourseCard from '@/components/course-card';
import EventCard from '@/components/event-card';
import FeedbackCard from '@/components/feedback-card';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Solid Heroicons matching template_frontend
function DocumentTextIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z"
        clipRule="evenodd"
      />
      <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
    </svg>
  );
}

function PlayCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PencilSquareIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
      <path d="M5.25 5.25a3 3 0 00-3 3v10.5a3 3 0 003 3h10.5a3 3 0 003-3V13.5a.75.75 0 00-1.5 0v5.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V8.25a1.5 1.5 0 011.5-1.5h5.25a.75.75 0 000-1.5H5.25z" />
    </svg>
  );
}

function PhoneArrowDownLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5zm15.75 0a.75.75 0 01.75.75v4.19l4.72-4.72a.75.75 0 111.06 1.06l-4.72 4.72h4.19a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75v-6a.75.75 0 01.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  );
}

function PuzzlePieceIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.25 5.337c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.036 1.007-1.875 2.25-1.875S15 2.34 15 3.375c0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959 0 .332.278.598.61.578 1.91-.114 3.79-.342 5.632-.676a.75.75 0 01.878.645 49.17 49.17 0 01.376 5.452.657.657 0 01-.66.664c-.354 0-.675-.186-.958-.401a1.647 1.647 0 00-1.003-.349c-1.035 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401.31 0 .557.262.534.571a48.774 48.774 0 01-.595 4.845.75.75 0 01-.61.61c-1.82.317-3.673.533-5.555.642a.58.58 0 01-.611-.581c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.035-1.007-1.875-2.25-1.875s-2.25.84-2.25 2.25c0 .369.128.713.349 1.003.215.283.401.604.401.959a.641.641 0 01-.658.643 49.118 49.118 0 01-4.708-.36.75.75 0 01-.645-.878c.293-1.614.504-3.257.629-4.924A.53.53 0 005.337 15c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.036 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.369 0 .713.128 1.003.349.283.215.604.401.959.401a.656.656 0 00.659-.663 47.703 47.703 0 00-.31-4.82.75.75 0 01.83-.832c1.343.155 2.703.254 4.077.294a.64.64 0 00.657-.642z" />
    </svg>
  );
}

function GlobeEuropeAfricaIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.262 6.072a8.25 8.25 0 1010.562-.766 4.5 4.5 0 01-1.318 1.357L14.25 7.5l.165.33a.809.809 0 01-1.086 1.085l-.604-.302a1.125 1.125 0 00-1.298.21l-.132.131c-.439.44-.439 1.152 0 1.591l.296.296c.256.257.622.374.98.314l1.17-.195c.323-.054.654.036.905.245l1.33 1.108c.32.267.46.694.358 1.1a8.7 8.7 0 01-2.288 4.04l-.723.724a1.125 1.125 0 01-1.298.21l-.153-.076a1.125 1.125 0 01-.622-1.006v-1.089c0-.298-.119-.585-.33-.796l-1.347-1.347a1.125 1.125 0 01-.21-1.298L9.75 12l-1.64-1.64a6 6 0 01-1.676-3.257l-.172-1.03z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
      <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
    </svg>
  );
}

const FALLBACK_COURSE_IMAGES = [
  '/image/blogs/blog4.svg',
  '/image/blogs/blog3.svg',
  '/image/blogs/blog2.svg',
  '/image/blogs/blog5.svg',
  '/image/blogs/blog6.svg',
];

const CATEGORY_CARDS_META = [
  {
    img: '/image/blogs/blog-3.png',
    icon: HeartIcon,
    defaultTitle: 'Teknologi & Pembuatan Website',
    defaultDesc: 'Kuasai keahlian digital paling dicari perusahaan',
  },
  {
    img: '/image/blogs/blog-12.jpeg',
    icon: PuzzlePieceIcon,
    defaultTitle: 'Bisnis, Karier & Produktivitas',
    defaultDesc: 'Tingkatkan nilai jual dan daya saing profesional Anda',
  },
  {
    img: '/image/blogs/blog-10.jpeg',
    icon: GlobeEuropeAfricaIcon,
    defaultTitle: 'Data, Analisis & Strategi Digital',
    defaultDesc: 'Ambil keputusan tepat berbasis studi kasus nyata',
  },
  {
    img: '/image/blogs/blog-13.png',
    icon: MicrophoneIcon,
    defaultTitle: 'Keterampilan Kerja & Industri',
    defaultDesc: 'Kurikulum terarah yang langsung siap dipraktikkan',
  },
];

const EVENTS = [
  {
    img: '/image/blogs/blog-1.svg',
    title: 'Langkah Awal Menembus Karier Digital Tanpa Latar Belakang IT',
    desc: 'Pelajari peta jalan belajar dari nol hingga memiliki portofolio karya yang dilirik oleh perekrut perusahaan.',
    buttonLabel: 'daftar gratis',
    href: '/register',
  },
  {
    img: '/image/blogs/blog2.svg',
    title: 'Workshop Praktis: Bangun Portofolio Proyek Pertama dalam 2 Hari',
    desc: 'Praktik langsung menyusun proyek nyata bersama mentor yang siap Anda cantumkan di CV dan profil LinkedIn.',
    buttonLabel: 'daftar gratis',
    href: '/register',
  },
  {
    img: '/image/blogs/blog3.svg',
    title: 'Bedah CV & Rahasia Lolos Wawancara Kerja bersama Praktisi HRD',
    desc: 'Diskusi interaktif membahas kesalahan umum pelamar kerja dan cara menonjolkan sertifikat keahlian Anda.',
    buttonLabel: 'lihat kelas',
    href: '/#explore-courses',
  },
  {
    img: '/image/blogs/blog4.svg',
    title: 'Strategi Menambah Penghasilan lewat Keahlian Profesional Baru',
    desc: 'Temukan cara mengubah keahlian baru Anda menjadi peluang kerja lepas (freelance) maupun kenaikan jabatan.',
    buttonLabel: 'lihat kelas',
    href: '/#explore-courses',
  },
];

const FEEDBACKS = [
  {
    feedback:
      'Penjelasan mentornya sangat membumi dan mudah diikuti walaupun saya benar-benar belajar dari nol. Yang paling menenangkan, cukup bayar sekali tanpa takut tagihan langganan bulanan!',
    client: 'Nadia Putri',
    title: 'Digital Marketing Specialist',
    img: '/image/avatar1.jpg',
  },
  {
    feedback:
      'Dulu saya ragu bisa pindah jalur karier. Berkat materi yang terstruktur rapi dan latihan praktik di Sinau, saya berhasil punya portofolio sendiri dan diterima kerja bulan lalu.',
    client: 'Dimas Saputra',
    title: 'Junior Web Developer',
    img: '/image/avatar3.jpg',
  },
  {
    feedback:
      'Videonya tetap lancar dan irit kuota saat saya belajar di perjalanan pulang kerja. Sertifikat kelulusannya juga bisa dicek keasliannya secara online oleh HRD tempat saya melamar.',
    client: 'Rina Wulandari',
    title: 'Karyawan Swasta & Freelancer',
    img: '/image/avatar2.jpg',
  },
];

const COMPANIES = [
  'coinbase',
  'spotify',
  'pinterest',
  'google',
  'amazon',
  'netflix',
];

function HomeCatalogContent() {
  const searchParams = useSearchParams();
  const [paymentFailed, setPaymentFailed] = useState(false);

  useEffect(() => {
    if (searchParams.get('payment') === 'failed') {
      setPaymentFailed(true);
    }
  }, [searchParams]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null as string | null);

  // Filter States
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [level, setLevel] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('');

  // Debounce input teks/angka
  const [debouncedFilter, setDebouncedFilter] = useState({ search: '', minPrice: '', maxPrice: '' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter({ search: search.trim(), minPrice, maxPrice });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, minPrice, maxPrice]);

  useEffect(() => {
    apiFetch<{ data: Category[] }>('/categories')
      .then((res) => setCategories(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedFilter.search) params.set('q', debouncedFilter.search);
    if (categoryId > 0) params.set('category_id', String(categoryId));
    if (level) params.set('level', level);
    if (debouncedFilter.minPrice !== '') params.set('min_price', debouncedFilter.minPrice);
    if (debouncedFilter.maxPrice !== '') params.set('max_price', debouncedFilter.maxPrice);
    if (minRating !== '') params.set('min_rating', minRating);

    const queryStr = params.toString();
    apiFetch<{ data: Course[] }>(`/courses${queryStr ? `?${queryStr}` : ''}`, {
      signal: controller.signal,
    })
      .then((res) => setCourses(res.data || []))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'Belum dapat menampilkan daftar kelas saat ini'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedFilter, categoryId, level, minRating]);

  const handleResetFilter = () => {
    setSearch('');
    setCategoryId(0);
    setLevel('');
    setMinPrice('');
    setMaxPrice('');
    setMinRating('');
  };

  const getCategoryName = (catId?: number | null) => {
    if (!catId) return 'Keahlian Pilihan';
    return categories.find((c) => c.id === catId)?.name || 'Kelas Praktis';
  };

  const scrollToExplore = (selectedCatId?: number) => {
    if (typeof selectedCatId === 'number') {
      setCategoryId(selectedCatId);
    }
    const el = document.getElementById('explore-courses');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const stats = [
    {
      icon: DocumentTextIcon,
      count: '10.200+',
      title: 'Alumni Siap Kerja',
    },
    {
      icon: PlayCircleIcon,
      count: '50+',
      title: 'Praktisi & Mentor Ahli',
    },
    {
      icon: PencilSquareIcon,
      count: courses.length > 0 ? `${courses.length}+` : '10+',
      title: 'Kelas Praktis Pilihan',
    },
    {
      icon: PhoneArrowDownLeftIcon,
      count: 'Selamanya',
      title: 'Sekali Bayar, Akses Penuh',
    },
  ];

  const categoryCards = CATEGORY_CARDS_META.map((meta, idx) => {
    const dynamicCat = categories[idx];
    return {
      img: meta.img,
      icon: meta.icon,
      title: dynamicCat ? dynamicCat.name : meta.defaultTitle,
      desc: dynamicCat?.description || meta.defaultDesc,
      catId: dynamicCat ? dynamicCat.id : 0,
    };
  });

  return (
    <div>
      {paymentFailed && (
        <div className="bg-red-600 text-white text-xs sm:text-sm font-semibold px-4 py-3 relative z-50">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <span>
              Pembayaran Anda belum selesai atau dibatalkan. Silakan pilih kembali kelas yang Anda inginkan di bawah ini.
            </span>
            <button
              type="button"
              onClick={() => setPaymentFailed(false)}
              className="underline font-bold shrink-0"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* 1. HERO SECTION */}
      <div className="!flex min-h-[55vh] w-full items-center justify-between px-4 sm:px-10">
        <Image
          width={1200}
          height={1200}
          src="/image/image8.svg"
          alt="Sinau E-Learning"
          className="absolute inset-0 ml-auto w-[920px] h-[780px] rounded-bl-[100px] object-cover object-center pointer-events-none"
        />
        <div className="container mx-auto mt-20 lg:mt-28 relative z-10">
          <div className="grid grid-cols-12 text-center lg:text-left">
            <div className="col-span-full rounded-xl border border-white bg-white/90 py-10 p-8 shadow-lg shadow-black/10 backdrop-blur-sm backdrop-saturate-200 xl:col-span-7">
              <h1 className="block antialiased tracking-normal font-sans font-bold text-blue-gray-900 lg:text-5xl !leading-snug text-3xl lg:max-w-3xl">
                Kuasai Keahlian Baru &amp; Raih Karier Impian Tanpa Biaya Langganan
              </h1>
              <p className="block antialiased font-sans text-xl font-normal leading-relaxed mb-6 mt-6 !text-gray-900">
                Kenalan dengan <strong>Sinau</strong> — platform belajar keterampilan praktis yang mengerti kesibukan Anda.
                Pilih kelas yang Anda butuhkan, cukup bayar sekali untuk akses seumur hidup, hemat kuota internet, dan raih sertifikat resmi siap melamar kerja.
              </p>

              {DEMO_MODE && (
                <div className="mb-8 flex flex-wrap items-center justify-center lg:justify-start gap-2.5 text-xs">
                  <span className="px-3.5 py-2 rounded-lg bg-gray-900/5 border border-gray-900/10 text-gray-800 font-medium">
                    🎁 Spesial Hari Ini: Gunakan kode <strong className="text-gray-900">HEMAT50</strong> untuk Diskon 50%
                  </span>
                  <span className="px-3.5 py-2 rounded-lg bg-gray-900/5 border border-gray-900/10 text-gray-800 font-medium">
                    🎓 Kode Beasiswa Penuh: <strong className="text-gray-900">BEASISWA100</strong> (Gratis 100%)
                  </span>
                </div>
              )}

              <div className="mb-8 flex flex-wrap justify-center gap-4 lg:justify-start">
                <button
                  type="button"
                  onClick={() => scrollToExplore()}
                  className="btn-primary"
                >
                  pilih kelas sekarang
                </button>
                <Link href="/verify" className="btn-outline">
                  cek sertifikat lulusan
                </Link>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 items-center justify-between gap-4 lg:justify-start">
                <Image
                  width={144}
                  height={144}
                  className="w-36 grayscale opacity-60 mx-auto lg:mx-0"
                  src="/logos/logo-pinterest.svg"
                  alt="pinterest"
                />
                <Image
                  width={144}
                  height={144}
                  className="w-36 grayscale opacity-60 mx-auto lg:mx-0"
                  src="/logos/logo-netflix.svg"
                  alt="netflix"
                />
                <Image
                  width={144}
                  height={144}
                  className="w-36 grayscale opacity-60 mx-auto lg:mx-0"
                  src="/logos/logo-coinbase.svg"
                  alt="coinbase"
                />
                <Image
                  width={144}
                  height={144}
                  className="w-36 grayscale opacity-60 mx-auto lg:mx-0"
                  src="/logos/logo-google.svg"
                  alt="google"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. OUT IMPRESSIVE STATS */}
      <section id="about" className="px-8 pt-40 lg:pt-60">
        <div className="container mx-auto text-center lg:text-left">
          <div className="grid place-items-center text-center">
            <h2 className="block antialiased tracking-normal font-sans font-bold leading-[1.3] text-blue-gray-900 mb-2 text-4xl">
              Kenapa Ribuan Pembelajar Memilih Sinau?
            </h2>
            <p className="block antialiased font-sans text-xl font-normal leading-relaxed mx-auto mb-24 w-full !text-gray-500 lg:w-6/12">
              Kami percaya peningkatan karier tidak boleh terhalang tagihan bulanan yang mahal atau kuota internet yang boros. Fokus kami satu: membuat Anda benar-benar terampil dan siap bersaing.
            </p>
          </div>
          <div className="grid gap-y-16 gap-x-10 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((props, key) => (
              <StatsCard key={key} {...props} />
            ))}
          </div>
        </div>
      </section>

      {/* 3. COURSES CATEGORIES */}
      <section id="categories" className="container mx-auto px-8 py-36">
        <div className="mb-20 grid place-items-center text-center">
          <h2 className="block antialiased tracking-normal font-sans text-4xl font-bold leading-[1.3] text-blue-gray-900 my-3">
            Pilih Jalur Keahlian Sesuai Tujuan Anda
          </h2>
          <p className="block antialiased font-sans text-xl font-normal leading-relaxed !text-gray-500 lg:w-6/12">
            Mulai dari nol hingga siap terjun ke dunia kerja. Setiap kelas dirancang dengan bahasa yang mudah dipahami dan studi kasus nyata dari industri.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="relative grid h-full min-h-[25rem] w-full place-items-center overflow-hidden text-center rounded-xl bg-gray-900 text-white shadow-md">
            <div className="absolute inset-0 h-full w-full bg-gray-900/75" />
            <div className="relative w-full p-6">
              <p className="block antialiased font-sans text-sm leading-normal text-white font-bold opacity-60 uppercase tracking-wider">
                Cocok untuk Pemula
              </p>
              <h4 className="block antialiased tracking-normal font-sans text-2xl font-semibold leading-snug text-white mt-9">
                Bingung Harus Mulai Belajar dari Mana?
              </h4>
              <p className="block antialiased font-sans text-base font-normal leading-relaxed text-white mt-4 mb-14 opacity-70">
                Temukan pilihan kelas dasar terpopuler yang paling banyak diambil oleh lulusan baru dan pencari kerja.
              </p>
              <button
                type="button"
                onClick={() => scrollToExplore(0)}
                className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-2.5 px-5 rounded-lg bg-white text-blue-gray-900 shadow-md hover:shadow-lg"
              >
                Lihat Semua Kelas
              </button>
            </div>
          </div>
          <div className="col-span-1 flex flex-col gap-6">
            {categoryCards.slice(0, 2).map((props, key) => (
              <CategoryCard
                key={key}
                img={props.img}
                icon={props.icon}
                title={props.title}
                desc={props.desc}
                onClick={() => scrollToExplore(props.catId)}
              />
            ))}
          </div>
          <div className="col-span-1 flex flex-col gap-6">
            {categoryCards.slice(2, 4).map((props, key) => (
              <CategoryCard
                key={key}
                img={props.img}
                icon={props.icon}
                title={props.title}
                desc={props.desc}
                onClick={() => scrollToExplore(props.catId)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. EXPLORE COURSES + LIVE CATALOG FILTER */}
      <section id="explore-courses" className="px-8 scroll-mt-24">
        <div className="container mx-auto mb-12 text-center">
          <h2 className="block antialiased tracking-normal font-sans text-4xl font-bold leading-[1.3] text-blue-gray-900">
            Investasi Terbaik untuk Masa Depan Anda
          </h2>
          <p className="block antialiased font-sans text-xl font-normal leading-relaxed mt-2 mx-auto w-full px-4 !text-gray-500 lg:w-6/12 lg:px-8">
            Pilih satu kelas yang paling Anda butuhkan hari ini. Cukup sekali bayar tanpa biaya bulanan tersembunyi — pelajari kapan saja sesuai ritme Anda.
          </p>
        </div>

        {/* Filter & Pencarian Katalog Kelas */}
        <div className="container mx-auto mb-20">
          <div className="rounded-xl border border-blue-gray-100 bg-white p-6 shadow-md shadow-black/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-bold text-blue-gray-900">Temukan Kelas yang Paling Cocok untuk Anda</h3>
              <button
                type="button"
                onClick={handleResetFilter}
                className="text-xs font-bold uppercase tracking-wider text-gray-700 hover:text-gray-900 underline self-start sm:self-auto"
              >
                Tampilkan Semua Kelas
              </button>
            </div>

            {/* Pil Kategori Cepat */}
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                type="button"
                onClick={() => setCategoryId(0)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  categoryId === 0
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-blue-gray-50 text-blue-gray-800 hover:bg-blue-gray-100'
                }`}
              >
                Semua Bidang
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    categoryId === cat.id
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-blue-gray-50 text-blue-gray-800 hover:bg-blue-gray-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Grid Input Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Cari Topik / Keahlian
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ketik keahlian yang ingin dipelajari..."
                  className="input"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Tingkat Materi
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="input"
                >
                  <option value="">Semua Tingkat</option>
                  {Object.entries(LEVEL_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Harga Mulai (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Batas Harga (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Contoh: 200000"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">
                  Penilaian Alumni
                </label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  className="input"
                >
                  <option value="">Semua Penilaian</option>
                  <option value="4.5">⭐ 4.5 ke atas (Favorit)</option>
                  <option value="4">⭐ 4.0 ke atas (Populer)</option>
                  <option value="3">⭐ 3.0 ke atas</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Status Error / Loading / Course Grid */}
        <div className="container mx-auto">
          {error && (
            <div className="alert-error mb-8 text-sm p-4">
              {error} — Silakan muat ulang halaman beberapa saat lagi.
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-x-10 gap-y-24 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-14">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="rounded-xl border border-blue-gray-100 bg-white p-6 h-96 animate-pulse flex flex-col justify-between shadow-md"
                >
                  <div className="h-56 w-full bg-blue-gray-50 rounded-xl" />
                  <div className="space-y-3 mt-4">
                    <div className="h-4 w-1/2 bg-blue-gray-100 rounded" />
                    <div className="h-6 w-3/4 bg-blue-gray-100 rounded" />
                    <div className="h-10 w-36 bg-blue-gray-100 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-xl border border-blue-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-lg font-bold text-blue-gray-900">Belum ada kelas yang cocok dengan pencarian Anda</p>
              <p className="text-sm text-gray-500 mt-1">
                Coba gunakan kata kunci lain atau klik tombol &quot;Tampilkan Semua Kelas&quot; di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-10 gap-y-24 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-14">
              {courses.map((course, idx) => {
                const imgSrc = course.thumbnail_url
                  ? resolveMediaUrl(course.thumbnail_url)
                  : FALLBACK_COURSE_IMAGES[idx % FALLBACK_COURSE_IMAGES.length];
                const tag = `${getLevelLabel(course.level)} • ${getCategoryName(course.category_id)} • ★ ${Number(
                  course.rating_avg || 0
                ).toFixed(1)} (${course.total_reviews} ulasan)`;
                const desc =
                  course.subtitle ||
                  course.description ||
                  'Pelajari langkah demi langkah lewat video yang mudah dipahami, panduan bacaan praktis, latihan interaktif, dan dapatkan sertifikat kelulusan resmi.';
                const label = `${formatPrice(course.price)} — Ambil Kelas Ini`;

                return (
                  <CourseCard
                    key={course.id}
                    img={imgSrc}
                    tag={tag}
                    title={course.title}
                    desc={desc}
                    label={label}
                    href={`/courses/detail?id=${course.id}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. VALUE HIGHLIGHT / SPOTLIGHT SECTION */}
      <section className="px-8 py-40">
        <div className="container mx-auto">
          <div className="relative flex flex-col bg-clip-border rounded-xl bg-transparent text-gray-700 shadow-none">
            <div className="p-6 col-span-full gap-10 place-items-center overflow-visible grid grid-cols-1 lg:grid-cols-4">
              <div className="w-full xl:w-[600px] flex items-center overflow-hidden rounded-xl justify-center col-span-2 h-full">
                <Image
                  width={768}
                  height={768}
                  src="/image/blogs/blog6.svg"
                  alt="Belajar Fleksibel di Sinau"
                  className="w-full h-full scale-110 object-cover"
                />
              </div>
              <div className="col-span-2 w-full">
                <h6 className="block antialiased tracking-normal font-sans text-base font-semibold leading-relaxed text-blue-500 mb-4 uppercase">
                  PENGALAMAN BELAJAR TANPA HAMBATAN
                </h6>
                <h3 className="block antialiased tracking-normal font-sans text-3xl leading-snug text-blue-gray-900 mb-4 font-bold">
                  Belajar Nyaman dari Mana Saja, Bahkan Saat Sinyal Pas-pasan
                </h3>
                <p className="block antialiased font-sans text-base leading-relaxed mb-4 w-full font-normal !text-gray-500">
                  Tidak punya banyak waktu luang atau sering terkendala kuota internet? Di Sinau, setiap materi dirancang ringkas, langsung ke inti permasalahan, dan nyaman dipelajari lewat laptop maupun ponsel Anda.
                </p>
                <div className="grid gap-2 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 bg-gray-900 rounded-full shrink-0" />
                    <p className="block antialiased font-sans text-base leading-relaxed w-full font-normal !text-gray-600">
                      <strong>Beli Sekali untuk Selamanya:</strong> Bebas ulangi materi kapan pun Anda butuh tanpa batas waktu.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 bg-gray-900 rounded-full shrink-0" />
                    <p className="block antialiased font-sans text-base leading-relaxed w-full font-normal !text-gray-600">
                      <strong>Sangat Hemat Kuota &amp; Bisa Offline:</strong> Video tetap jernih dengan pemakaian kuota super irit dan bisa disimpan di aplikasi HP.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 bg-gray-900 rounded-full shrink-0" />
                    <p className="block antialiased font-sans text-base leading-relaxed w-full font-normal !text-gray-600">
                      <strong>Sertifikat Diakui &amp; Mudah Dicek:</strong> Setiap sertifikat memiliki kode keaslian resmi yang bisa dicek langsung oleh HRD perusahaan.
                    </p>
                  </div>
                </div>
                <div className="flex items-center mt-8 gap-4">
                  <img
                    src="/image/avatar3.jpg"
                    alt="Rizky Pratama"
                    className="inline-block relative object-cover object-center !rounded-full w-12 h-12"
                  />
                  <div>
                    <h6 className="block antialiased tracking-normal font-sans text-base font-semibold leading-relaxed text-blue-gray-900 mb-0.5">
                      Rizky Pratama
                    </h6>
                    <p className="block antialiased font-sans text-sm leading-normal font-normal !text-gray-500">
                      Kepala Kurikulum &amp; Mentor Karier @ Sinau
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. EVENTS SECTION */}
      <section id="events" className="py-20 px-8">
        <div className="container mx-auto mb-20 text-center">
          <h2 className="block antialiased tracking-normal font-sans text-4xl font-bold leading-[1.3] text-blue-gray-900 mb-4">
            Sesi Belajar Langsung &amp; Bedah Karier
          </h2>
          <p className="block antialiased font-sans text-xl leading-relaxed mx-auto w-full px-4 font-normal !text-gray-500 lg:w-6/12">
            Ikuti diskusi interaktif dan workshop praktis bersama para praktisi industri untuk mempercepat langkah karier Anda.
          </p>
        </div>
        <div className="container mx-auto grid grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2 xl:grid-cols-4">
          {EVENTS.map((props, idx) => (
            <EventCard key={idx} {...props} />
          ))}
        </div>
      </section>

      {/* 7. STUDENTS FEEDBACK SECTION */}
      <section className="px-8 py-36">
        <div className="container mx-auto">
          <div className="mb-16 flex flex-col items-center w-full">
            <h2 className="block antialiased tracking-normal font-sans text-4xl font-bold leading-[1.3] text-blue-gray-900 mb-2 text-center">
              Cerita Nyata Mereka yang Sudah Melangkah Lebih Dulu
            </h2>
            <p className="block antialiased font-sans text-xl font-normal leading-relaxed mb-10 max-w-3xl lg:text-center !text-gray-500">
              Ribuan pelajar, mahasiswa, dan pekerja telah membuktikan bahwa menambah keahlian baru di Sinau jauh lebih mudah dipahami dan berdampak nyata pada karier mereka.
            </p>
          </div>
          <div className="grid gap-x-8 gap-y-12 lg:px-32 grid-cols-1 md:grid-cols-3">
            {FEEDBACKS.map((props, key) => (
              <FeedbackCard key={key} {...props} />
            ))}
          </div>
        </div>
      </section>

      {/* 8. TRUSTED COMPANIES SECTION */}
      <section className="py-8 px-8 lg:py-20">
        <div className="container mx-auto grid items-center place-items-center">
          <div className="text-center">
            <h6 className="block antialiased tracking-normal font-sans text-base font-semibold leading-relaxed mb-4 uppercase !text-gray-500">
              DIPERCAYA OLEH TALENTA DARI BERBAGAI INDUSTRI
            </h6>
            <h2 className="block antialiased tracking-normal font-sans text-4xl font-bold leading-[1.3] text-blue-gray-900 mb-12">
              Alumni Kami Berkarier di 200+ Perusahaan Terkemuka
            </h2>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-10">
            {COMPANIES.map((logo, key) => (
              <Image
                width={768}
                height={768}
                key={key}
                src={`/logos/logo-${logo}.svg`}
                alt={logo}
                className="w-40 grayscale opacity-75"
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function HomeCatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-24 text-center text-sm text-gray-500">
          Menyiapkan katalog kelas terbaik untuk Anda...
        </div>
      }
    >
      <HomeCatalogContent />
    </Suspense>
  );
}
