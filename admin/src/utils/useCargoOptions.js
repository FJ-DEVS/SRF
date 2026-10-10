import { useEffect, useState } from 'react';
import api from './api';

// Cargo names for the order-list cargo filter, readable by every staff role
// (admin, accounts, CRM, roller). Loaded once per mount; [] until it arrives.
const useCargoOptions = () => {
  const [cargos, setCargos] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.get('/cargo/options', { params: { limit: 500 } })
      .then((res) => { if (!cancelled && res.data.success) setCargos(res.data.data); })
      .catch((error) => console.error('Error fetching cargo options:', error));
    return () => { cancelled = true; };
  }, []);

  return cargos;
};

export default useCargoOptions;
