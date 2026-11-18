import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface CourseCardProps {
  img: string;
  tag: string;
  title: string;
  desc: string;
  label: string;
  href?: string;
}

export function CourseCard({ img, tag, title, desc, label, href = '#' }: CourseCardProps) {
  return (
    <div className="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md border border-blue-gray-100">
      <div className="relative bg-clip-border mt-4 mx-4 rounded-xl overflow-hidden bg-white text-gray-700 shadow-lg h-64">
        <Image
          width={768}
          height={768}
          src={img}
          alt={title}
          className="h-full w-full object-cover scale-[1.1]"
        />
      </div>
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="block antialiased font-sans text-sm leading-normal mb-2 font-normal text-gray-500">
              {tag}
            </p>
          </div>
          <Link
            href={href}
            className="text-blue-gray-900 transition-colors hover:text-gray-900"
          >
            <h5 className="block antialiased tracking-normal font-sans text-xl font-semibold leading-snug mb-2 normal-case">
              {title}
            </h5>
          </Link>
          <p className="block antialiased font-sans text-base leading-relaxed mb-6 font-normal !text-gray-500 line-clamp-3">
            {desc}
          </p>
        </div>
        <div>
          <Link
            href={href}
            className="inline-block align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg border border-gray-900 text-gray-900 hover:opacity-75 focus:ring focus:ring-gray-300 active:opacity-[0.85]"
          >
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CourseCard;
