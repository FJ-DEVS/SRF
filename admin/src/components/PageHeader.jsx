import React from 'react';

// Consistent page heading with optional action buttons on the right
const PageHeader = ({ title, subtitle, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
    <div className="min-w-0">
      <h1 className="srf-page-title">{title}</h1>
      {subtitle && <p className="srf-page-sub">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

export default PageHeader;
