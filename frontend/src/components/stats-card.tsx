import React from 'react';

interface StatsCardProps {
  icon: React.ElementType;
  count: string;
  title: string;
}

export function StatsCard({ icon: Icon, count, title }: StatsCardProps) {
  return (
    <div className="relative flex flex-col bg-clip-border rounded-xl bg-transparent text-gray-700 shadow-none items-center">
      <Icon className="h-7 w-7 text-gray-900" />
      <h1 className="block antialiased tracking-normal font-sans font-bold leading-tight text-blue-gray-900 mb-2 mt-4 text-5xl">
        {count}
      </h1>
      <h6 className="block antialiased tracking-normal font-sans text-base leading-relaxed text-blue-gray-500 mb-2 font-normal">
        {title}
      </h6>
    </div>
  );
}

export default StatsCard;
