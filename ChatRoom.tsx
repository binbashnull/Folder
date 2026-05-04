import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase, Message, Profile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import MediaMessage from './MediaMessage';
import {
  Send, Paperclip, LogOut, Crown, ThumbsUp,
  Image, Video, File, X, Users, ChevronDown
} from 'lucide-react';

export default function ChatRoom() {
  const { profile, signOut } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchMembers();

    const channel = supabase
      .channel('group-chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select('*, profiles(*), likes(*)')
          .eq('id', payload.new.id)
          .maybeSingle();
        if (data) {
          setMessages((prev) => [...prev, data]);
          setTimeout(() => scrollToBottom(), 50);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'likes',
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.new.message_id
              ? { ...m, likes: [...(m.likes ?? []), payload.new as typeof m.likes[0]] }
              : m
          )
        );
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'likes',
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            likes: (m.likes ?? []).filter((l) => l.id !== payload.old.id),
          }))
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [scrollToBottom]);

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(*), likes(*)')
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) {
      setMessages(data);
      setTimeout(() => scrollToBottom(false), 100);
    }
  }

  async function fetchMembers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    if (data) setMembers(data);
  }

  function handleScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMediaPreview({ file, url });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearPreview() {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
    setMediaPreview(null);
  }

  function getMediaType(file: File): 'image' | 'video' | 'file' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || (!text.trim() && !mediaPreview)) return;
    setSending(true);

    try {
      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'video' | 'file' | null = null;
      let mediaName: string | null = null;

      if (mediaPreview) {
        setUploading(true);
        const file = mediaPreview.file;
        const ext = file.name.split('.').pop();
        const path = `${profile.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-media')
          .getPublicUrl(path);

        mediaUrl = publicUrl;
        mediaType = getMediaType(file);
        mediaName = file.name;
        setUploading(false);
        clearPreview();
      }

      await supabase.from('messages').insert({
        user_id: profile.id,
        content: text.trim() || null,
        media_url: mediaUrl,
        media_type: mediaType,
        media_name: mediaName,
      });

      setText('');
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
      setUploading(false);
    }
  }

  async function toggleLike(messageId: string) {
    if (!profile?.is_admin) return;
    const msg = messages.find((m) => m.id === messageId);
    const alreadyLiked = msg?.likes?.some((l) => l.admin_id === profile.id);

    if (alreadyLiked) {
      const like = msg?.likes?.find((l) => l.admin_id === profile.id);
      if (like) await supabase.from('likes').delete().eq('id', like.id);
    } else {
      await supabase.from('likes').insert({ message_id: messageId, admin_id: profile.id });
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts: string) {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function groupByDate(msgs: Message[]) {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    msgs.forEach((m) => {
      const d = formatDate(m.created_at);
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, messages: [m] });
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    });
    return groups;
  }

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  const isOwn = (msg: Message) => msg.user_id === profile?.id;
  const dateGroups = groupByDate(messages);

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar - Members */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-zinc-950 border-r border-zinc-800
        transform transition-transform duration-300 ease-in-out
        ${showMembers ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:flex lg:flex-col
      `}>
        <div className="p-5 border-b border-zinc-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4" />
            Members <span className="text-xs text-zinc-500 font-normal ml-1">({members.length})</span>
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900 transition-colors">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold flex-shrink-0 relative">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={m.username} className="w-full h-full rounded-full object-cover" />
                ) : (
                  getInitials(m.username)
                )}
                {m.is_admin && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-400 rounded-full flex items-center justify-center">
                    <Crown className="w-2 h-2 text-black" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{m.username}</p>
                {m.is_admin && <p className="text-xs text-yellow-500">Admin</p>}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Sidebar overlay for mobile */}
      {showMembers && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setShowMembers(false)}
        />
      )}

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMembers(!showMembers)}
              className="lg:hidden text-zinc-400 hover:text-white transition-colors p-1"
            >
              <Users className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <span className="text-black font-bold text-sm">KF</span>
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm">KF Group Chat</h1>
              <p className="text-xs text-zinc-500">{members.length} members</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile && (
              <div className="flex items-center gap-2 mr-2">
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold">
                  {getInitials(profile.username)}
                </div>
                <span className="text-sm text-zinc-300 hidden sm:block">{profile.username}</span>
                {profile.is_admin && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
              </div>
            )}
            <button
              onClick={signOut}
              className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-lg"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scroll-smooth"
        >
          {dateGroups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-center my-4">
                <span className="text-xs text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                  {group.date}
                </span>
              </div>
              {group.messages.map((msg, idx) => {
                const own = isOwn(msg);
                const prevMsg = group.messages[idx - 1];
                const showAvatar = !prevMsg || prevMsg.user_id !== msg.user_id;
                const likeCount = msg.likes?.length ?? 0;
                const adminLiked = msg.likes?.some((l) => l.admin_id === profile?.id);

                return (
                  <div key={msg.id} className={`flex gap-2 ${own ? 'flex-row-reverse' : 'flex-row'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
                    {/* Avatar */}
                    <div className={`flex-shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold">
                        {msg.profiles?.avatar_url ? (
                          <img src={msg.profiles.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          getInitials(msg.profiles?.username ?? '?')
                        )}
                      </div>
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[70%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                      {showAvatar && !own && (
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          <span className="text-xs font-medium text-zinc-300">{msg.profiles?.username}</span>
                          {msg.profiles?.is_admin && <Crown className="w-3 h-3 text-yellow-400" />}
                        </div>
                      )}
                      <div className={`
                        relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                        ${own
                          ? 'bg-white text-black rounded-tr-sm'
                          : 'bg-zinc-800 text-white rounded-tl-sm border border-zinc-700'
                        }
                      `}>
                        {msg.content && <p className="break-words">{msg.content}</p>}
                        {msg.media_url && msg.media_type && (
                          <MediaMessage
                            url={msg.media_url}
                            type={msg.media_type}
                            name={msg.media_name}
                          />
                        )}
                        <span className={`text-[10px] mt-1 block ${own ? 'text-zinc-500 text-right' : 'text-zinc-500 text-right'}`}>
                          {formatTime(msg.created_at)}
                        </span>
                      </div>

                      {/* Like button - admin only, and like count for all */}
                      <div className={`flex items-center gap-1 mt-1 ${own ? 'flex-row-reverse' : ''}`}>
                        {likeCount > 0 && (
                          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5">
                            <ThumbsUp className="w-3 h-3 text-zinc-300" />
                            <span className="text-xs text-zinc-300 font-medium">{likeCount}</span>
                          </div>
                        )}
                        {profile?.is_admin && (
                          <button
                            onClick={() => toggleLike(msg.id)}
                            className={`p-1.5 rounded-full transition-all duration-150 ${
                              adminLiked
                                ? 'bg-white text-black'
                                : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
                            }`}
                            title={adminLiked ? 'Unlike' : 'Like'}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-6 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white p-2 rounded-full shadow-lg transition-all duration-200 z-10"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* Media Preview */}
        {mediaPreview && (
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800">
            <div className="flex items-center gap-3 bg-zinc-800 rounded-xl p-3 max-w-xs">
              {mediaPreview.file.type.startsWith('image/') ? (
                <img src={mediaPreview.url} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
              ) : mediaPreview.file.type.startsWith('video/') ? (
                <div className="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center">
                  <Video className="w-5 h-5 text-zinc-400" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center">
                  <File className="w-5 h-5 text-zinc-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{mediaPreview.file.name}</p>
                <p className="text-xs text-zinc-500">{(mediaPreview.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={clearPreview} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
          <form onSubmit={sendMessage} className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all duration-150"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <div className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click(); fileInputRef.current.accept = 'image/*,video/*,.pdf,.doc,.docx,.txt,.zip'; } }}
                className="p-2.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all duration-150"
                title="Send image"
              >
                <Image className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'video/*'; fileInputRef.current.click(); fileInputRef.current.accept = 'image/*,video/*,.pdf,.doc,.docx,.txt,.zip'; } }}
                className="p-2.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-all duration-150"
                title="Send video"
              >
                <Video className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Message..."
                rows={1}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors text-sm resize-none max-h-28 overflow-y-auto leading-relaxed"
                style={{ minHeight: '44px' }}
              />
            </div>

            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !mediaPreview)}
              className="flex-shrink-0 w-10 h-10 bg-white hover:bg-zinc-200 text-black rounded-xl flex items-center justify-center transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending || uploading ? (
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

