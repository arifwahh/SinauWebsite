import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface EventCardProps {
  img: string;
  title: string;
  desc: string;
  buttonLabel: string;
  href?: string;
}

export function EventCard({ img, title, desc, buttonLabel, href = '/register' }: EventCardProps) {
  return (
    <div className="relative flex flex-col bg-clip-border rounded-xl bg-transparent text-gray-700 shadow-none">
      <div className="relative bg-clip-border rounded-xl overflow-hidden bg-white text-gray-700 shadow-md mx-0 mt-0 mb-6 h-48">
        <Image
          width={768}
          height={768}
          src={img}
          alt={title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-0">
        <Link
          href={href}
          className="text-blue-gray-900 transition-colors hover:text-gray-800"
        >
          <h5 className="block antialiased tracking-normal font-sans text-xl font-semibold leading-snug mb-2">
            {title}
          </h5>
        </Link>
        <p className="block antialiased font-sans text-base leading-relaxed mb-6 font-normal !text-gray-500">
          {desc}
        </p>
        <Link
          href={href}
          className="inline-block align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-2 px-4 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10 hover:shadow-lg hover:shadow-gray-900/20"
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}

export default EventCard;
