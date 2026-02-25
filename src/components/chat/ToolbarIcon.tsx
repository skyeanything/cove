import React from "react";

export function ToolbarIcon({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactElement;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={title}
    >
      <span className="size-4 [&>svg]:size-4 [&>svg]:stroke-[1.5]">
        {icon}
      </span>
    </button>
  );
}
