import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, Clock, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
    id: string;
    user_id: string;
    staff_id?: string;
    content: string;
    created_at: string;
    staff_members?: { name: string };
    auth_users?: { email: string }; // If we can join auth users, but usually Supabase doesn't expose auth.users directly. We rely on staff_members link or metadata.
}

interface CommentsTabProps {
    workId: string;
    onUpdate?: () => void;
}

export function CommentsTab({ workId, onUpdate }: CommentsTabProps) {
    const { user } = useAuth();
    const toast = useToast();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchComments();

        // Real-time subscription
        const channel = supabase
            .channel('work_comments')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'work_comments', filter: `work_id=eq.${workId}` },
                () => {
                    fetchComments();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [workId]);

    useEffect(() => {
        scrollToBottom();
    }, [comments]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchComments = async () => {
        try {
            const { data, error } = await supabase
                .from('work_comments')
                .select(`
          *,
          staff_members(name)
        `)
                .eq('work_id', workId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setComments(data || []);
        } catch (error) {
            console.error('Error fetching comments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        try {
            // Get staff ID if available
            const { data: staffData } = await supabase
                .from('staff_members')
                .select('id')
                .eq('auth_user_id', user!.id)
                .single();

            const { error } = await supabase.from('work_comments').insert({
                work_id: workId,
                user_id: user!.id,
                staff_id: staffData?.id,
                content: newComment.trim(),
                is_internal: true
            });

            if (error) throw error;
            setNewComment('');
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error('Error posting comment:', error);
            toast.error('Failed to post comment');
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!confirm('Delete this message?')) return;
        try {
            const { error } = await supabase.from('work_comments').delete().eq('id', commentId);
            if (error) throw error;
            toast.success('Message deleted');
        } catch (error) {
            console.error('Error deleting comment:', error);
            toast.error('Failed to delete message');
        }
    };

    if (loading) return <div className="p-4 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

    return (
        <div className="flex flex-col h-[600px] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 bg-white border-b border-gray-200 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Send size={18} className="text-blue-600" />
                    Team Chat
                </h3>
                <p className="text-xs text-gray-500">Communicate with admin and team members about this work</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {comments.length === 0 ? (
                    <div className="text-center py-12 opacity-50">
                        <p className="text-gray-500">No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    comments.map((comment) => {
                        const isMe = comment.user_id === user?.id;
                        return (
                            <div key={comment.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'}`}>
                                        <UserIcon size={14} />
                                    </div>

                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-center gap-2 mb-1 px-1`}>
                                            <span className="text-xs font-bold text-gray-700">
                                                {comment.staff_members?.name || 'User'}
                                            </span>
                                            <span className="text-[10px] text-gray-400">
                                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                            </span>
                                        </div>

                                        <div className={`group relative p-3 rounded-2xl shadow-sm border ${isMe
                                                ? 'bg-blue-600 text-white rounded-tr-none border-blue-600'
                                                : 'bg-white text-gray-800 rounded-tl-none border-gray-200'
                                            }`}>
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.content}</p>

                                            {isMe && (
                                                <button
                                                    onClick={() => handleDelete(comment.id)}
                                                    className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                        placeholder="Type your message..."
                    />
                    <button
                        type="submit"
                        disabled={!newComment.trim()}
                        className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}
