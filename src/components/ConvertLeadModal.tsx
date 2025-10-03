// src/components/ConvertLeadModal.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import CustomerFormModal from './CustomerFormModal';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  image_url: string;
  contact_person: string;
  designation: string;
  alternate_phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  notes: string;
  lead_services?: { service_id: string; services: { id: string; name: string } }[];
}

interface ConvertLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConvertLeadModal({
  lead,
  onClose,
  onSuccess,
}: ConvertLeadModalProps) {
  const { user } = useAuth();

  const handleCustomerCreated = async (customerId: string) => {
    try {
      // Copy lead services to customer services
      if (lead.lead_services && lead.lead_services.length > 0) {
        const customerServices = lead.lead_services.map((ls: any) => ({
          customer_id: customerId,
          service_id: ls.service_id,
          user_id: user?.id,
          status: 'active',
        }));

        const { error: servicesError } = await supabase
          .from('customer_services')
          .insert(customerServices);

        if (servicesError) throw servicesError;
      }

      // Delete the lead
      const { error: deleteError } = await supabase
        .from('leads')
        .delete()
        .eq('id', lead.id);

      if (deleteError) throw deleteError;

      alert('Lead successfully converted to customer!');
      onSuccess();
    } catch (error: any) {
      console.error('Error converting lead:', error.message);
      alert(`Failed to convert lead: ${error.message}`);
    }
  };

  // Prepare initial data from lead
  const initialCustomerData = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company_name: lead.company_name,
    image_url: lead.image_url,
    contact_person: lead.contact_person,
    designation: lead.designation,
    alternate_phone: lead.alternate_phone,
    website: lead.website,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    pincode: lead.pincode,
    country: lead.country || 'India',
    notes: lead.notes,
  };

  return (
    <CustomerFormModal
      onClose={onClose}
      onSuccess={handleCustomerCreated}
      initialData={initialCustomerData}
      mode="create"
      title={`Convert Lead to Customer: ${lead.name}`}
    />
  );
}