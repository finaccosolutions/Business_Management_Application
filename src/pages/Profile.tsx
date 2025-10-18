// src/pages/Profile.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { User, Mail, Phone, Globe, MapPin, Save } from 'lucide-react';
import { COUNTRY_LIST, getCountryConfig } from '../config/countryConfig';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  country: string;
  phone_country_code: string;
  mobile_number: string;
}

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    id: '',
    email: '',
    full_name: '',
    country: 'IN',
    phone_country_code: '+91',
    mobile_number: '',
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error.message);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          country: profile.country,
          phone_country_code: profile.phone_country_code,
          mobile_number: profile.mobile_number,
        })
        .eq('id', user!.id);

      if (error) throw error;

      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('Error updating profile:', error.message);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const countryConfig = getCountryConfig(profile.country);
  const selectedCountry = COUNTRY_LIST.find((c) => c.code === profile.country);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600 mt-1">Manage your account information and preferences</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User size={20} className="text-blue-600" />
              Personal Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Mail size={14} />
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Globe size={20} className="text-blue-600" />
              Regional Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <select
                  value={profile.country}
                  onChange={(e) => {
                    const newCountry = e.target.value;
                    const newCountryData = COUNTRY_LIST.find((c) => c.code === newCountry);
                    setProfile({
                      ...profile,
                      country: newCountry,
                      phone_country_code: newCountryData?.phoneCode || '+91',
                    });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {COUNTRY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Phone size={14} />
                  Mobile Number
                </label>
                <div className="flex gap-2">
                  <div className="w-32">
                    <input
                      type="text"
                      disabled
                      value={`${selectedCountry?.flag} ${profile.phone_country_code}`}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-not-allowed text-center"
                    />
                  </div>
                  <input
                    type="tel"
                    value={profile.mobile_number}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        mobile_number: e.target.value.replace(/[^0-9]/g, ''),
                      })
                    }
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1234567890"
                    maxLength={15}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Country-Specific Configuration
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm font-medium text-gray-700">Currency:</span>
                <span className="text-sm text-gray-900">
                  {countryConfig.currency} ({countryConfig.currencySymbol})
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm font-medium text-gray-700">Tax System:</span>
                <span className="text-sm text-gray-900">{countryConfig.taxName}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-green-200">
                <span className="text-sm font-medium text-gray-700">Date Format:</span>
                <span className="text-sm text-gray-900">{countryConfig.dateFormat}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-700">Number Format:</span>
                <span className="text-sm text-gray-900">
                  Decimal: {countryConfig.numberFormat.decimal}, Thousands:{' '}
                  {countryConfig.numberFormat.thousands}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-4">
              These settings are automatically applied throughout the application based on your selected
              country.
            </p>
          </div>

          <div className="flex justify-end pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg font-medium"
            >
              <Save size={20} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
