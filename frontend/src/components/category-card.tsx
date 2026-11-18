import React from 'react';
import Image from 'next/image';

interface CategoryCardProps {
  img: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  onClick?: () => void;
}

export function CategoryCard({ img, title, desc, icon: Icon, onClick }: CategoryCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative grid min-h-[12rem] w-full overflow-hidden rounded-xl bg-white bg-clip-border text-gray-700 shadow-md cursor-pointer group"
    >
      <Image
        width={768}
        height={768}
        src={img}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 h-full w-full bg-black/70 transition-colors group-hover:bg-black/60" />
      <div className="relative p-6 flex flex-col justify-between">
        <Icon className="h-8 w-8 text-white" />
        <div>
          <h5 className="block antialiased tracking-normal font-sans text-xl font-semibold leading-snug text-white mb-1">
            {title}
          </h5>
          <p className="block antialiased font-sans text-white text-xs font-bold opacity-50">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CategoryCard;
