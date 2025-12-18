import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export function usePermissions() {
    const { user } = useAuth();
    const [permissions, setPermissions] = useState<any>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let mounted = true;

        const fetchPermissions = async () => {
            if (!user) {
                if (mounted) setLoading(false);
                return;
            }

            try {
                // 1. Check Profiles to see if Admin/Owner
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role, owner_id')
                    .eq('id', user.id)
                    .single();

                if (!profileError && (profile?.role === 'admin' || !profile?.owner_id)) {
                    if (mounted) {
                        setIsAdmin(true);
                        setRole('admin');
                        setLoading(false);
                    }
                    return;
                }

                // 2. If not admin, check Staff Members table
                const { data: staff, error: staffError } = await supabase
                    .from('staff_members')
                    .select('detailed_permissions, role')
                    .eq('auth_user_id', user.id)
                    .single();

                if (!staffError && staff) {
                    if (mounted) {
                        setPermissions(staff.detailed_permissions || {});
                        setRole(staff.role || 'staff');
                        // In case the staff record marks them as admin (legacy or dual-role)
                        setIsAdmin(staff.role === 'admin');
                    }
                } else {
                    // If linked profile says 'staff' but no staff_member record found, access is minimal
                    if (mounted) setRole('staff');
                }
            } catch (err) {
                console.error("Error fetching permissions:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchPermissions();

        return () => { mounted = false; };
    }, [user]);

    const checkPermission = (module: string, action: string): boolean => {
        // If loading, default to false to be safe, or maybe null? 
        // False is safer for buttons.
        if (loading) return false;

        // Admins have full access
        if (isAdmin) return true;

        // Check specific permission
        if (permissions && permissions[module] && permissions[module][action] === true) {
            return true;
        }

        return false;
    };

    return {
        checkPermission,
        role,
        isAdmin,
        loading
    };
}
