import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { normalizeCampaign, subscribeToTable } from './supabaseData';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaigns = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching campaigns:", error);
        setLoading(false);
        return;
      }

      setCampaigns((data || []).map(normalizeCampaign));
      setLoading(false);
    };

    void fetchCampaigns();
    const unsubscribe = subscribeToTable('campaigns-hook', 'campaigns', () => {
      void fetchCampaigns();
    });

    return () => unsubscribe();
  }, []);

  return { 
    campaigns, 
    activeCampaigns: campaigns.filter(c => c.status === 'Active'),
    loading 
  };
}
