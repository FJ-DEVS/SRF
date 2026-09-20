import React from 'react';
import { typeStyle } from '../utils/orderType';

const TypeBadge = ({ type }) => {
  const style = typeStyle(type);
  return (
    <span className={`srf-badge ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
};

export default TypeBadge;
