import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'file' | null;
  media_name: string | null;
  created_at: string;
  profiles?: Profile;
  likes?: Like[];
};

export type Like = {
  id: string;
  message_id: string;
  admin_id: string;
  created_at: string;
};
