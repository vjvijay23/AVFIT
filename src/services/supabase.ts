import { createClient } from '@supabase/supabase-js';
import Config from 'react-native-config';

const SUPABASE_URL = Config.AVFIT_SUPABASE_URL || 'https://mock-project.supabase.co';
const SUPABASE_ANON_KEY = Config.AVFIT_SUPABASE_ANON_KEY || 'mock-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
