import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, RefreshCw, Settings as SettingsIcon, 
  Target, Handshake, MonitorPlay, Calendar, Gift, 
  Smile, BookOpen, Share2, DollarSign, Plus, Trash2, MapPin, CheckSquare, Pencil, X, AlertTriangle, Users, Download, Upload
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot, addDoc, deleteDoc, updateDoc, query, orderBy, writeBatch, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

const CHECKLIST_TEMPLATE_TYPES = ['Digital', 'Physical', 'Hybrid'] as const;
const CHECKLIST_TEMPLATE_CATEGORIES = [
  'New Product Launch',
  'Social Media Campaign',
  'Outsource Agency',
  'Seasonal Promo',
  'Outlet Opening',
  'KOL Visit'
] as const;

type ChecklistTemplateType = typeof CHECKLIST_TEMPLATE_TYPES[number];
type ChecklistTemplateCategory = typeof CHECKLIST_TEMPLATE_CATEGORIES[number];

type ChecklistTemplateFormState = {
  name: string;
  type: ChecklistTemplateType;
  category: ChecklistTemplateCategory;
  tasks: string[];
};

type TemplateFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type ManagedUserRole = 'admin' | 'supervisor' | 'finance';
type ManagedUserStatus = 'active' | 'invited' | 'suspended';

type ManagedUserRecord = {
  id: string;
  auth_uid: string;
  email: string;
  display_name: string;
  role: ManagedUserRole;
  outlet_id: string;
  outlet_name: string;
  status: ManagedUserStatus;
  photo_url: string;
};

type ManagedUserFormState = {
  email: string;
  display_name: string;
  role: ManagedUserRole;
  outlet_id: string;
  outlet_name: string;
  status: ManagedUserStatus;
};

type UserFeedback = {
  tone: 'success' | 'error';
  message: string;
};

const SALES_IMPORT_HEADERS = [
  'month_key',
  'outlet_id',
  'outlet_name',
  'total_sales',
  'grab_gross_order_value',
  'grab_commission_fees',
  'grab_ad_spend',
  'foodpanda_gross_order_value',
  'foodpanda_commission_fees',
  'foodpanda_ad_spend'
] as const;

type SalesImportFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type SalesImportPreview = {
  fileName: string;
  rowCount: number;
  monthKeys: string[];
};

type ParsedSalesImportRow = {
  month_key: string;
  outlet_id: string;
  outlet_name: string;
  total_sales: number;
  grab_gross_order_value: number;
  grab_commission_fees: number;
  grab_ad_spend: number;
  foodpanda_gross_order_value: number;
  foodpanda_commission_fees: number;
  foodpanda_ad_spend: number;
};

type BudgetHistoryRecord = {
  id: string;
  month_key: string;
  sales_rollup_total: number;
  marketing_budget_total: number;
  budget_rate: number;
  locked: boolean;
};

const budgetCurrencyFormatter = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function isManagedUserRole(value: unknown): value is ManagedUserRole {
  return value === 'admin' || value === 'supervisor' || value === 'finance';
}

function isManagedUserStatus(value: unknown): value is ManagedUserStatus {
  return value === 'active' || value === 'invited' || value === 'suspended';
}

function normalizeManagedUserRecord(id: string, rawUser: any): ManagedUserRecord | null {
  if (!isManagedUserRole(rawUser?.role)) {
    return null;
  }

  const email = typeof rawUser?.email === 'string' ? rawUser.email.trim().toLowerCase() : '';
  const legacyOutlet = typeof rawUser?.outlet === 'string' ? rawUser.outlet.trim() : '';
  const outletId = typeof rawUser?.outlet_id === 'string' && rawUser.outlet_id.trim()
    ? rawUser.outlet_id.trim()
    : legacyOutlet;
  const outletName = typeof rawUser?.outlet_name === 'string' && rawUser.outlet_name.trim()
    ? rawUser.outlet_name.trim()
    : legacyOutlet;
  const explicitAuthUid = typeof rawUser?.auth_uid === 'string' ? rawUser.auth_uid.trim() : '';

  return {
    id,
    auth_uid: explicitAuthUid || (email && id === email ? '' : id),
    email,
    display_name: typeof rawUser?.display_name === 'string' ? rawUser.display_name : '',
    role: rawUser.role,
    outlet_id: outletId,
    outlet_name: outletName,
    status: isManagedUserStatus(rawUser?.status) ? rawUser.status : 'active',
    photo_url: typeof rawUser?.photo_url === 'string' ? rawUser.photo_url : ''
  };
}

function getManagedUserProvisioningState(user: ManagedUserRecord) {
  return user.auth_uid.trim() ? 'claimed' : 'provisional';
}

function buildUserFormState(user: ManagedUserRecord): ManagedUserFormState {
  return {
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    outlet_id: user.outlet_id,
    outlet_name: user.outlet_name,
    status: user.status
  };
}

function buildEmptyUserFormState(): ManagedUserFormState {
  return {
    email: '',
    display_name: '',
    role: 'supervisor',
    outlet_id: '',
    outlet_name: '',
    status: 'invited'
  };
}

function getManagedUserErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function buildEmptyChecklistTemplateForm(): ChecklistTemplateFormState {
  return {
    name: '',
    type: 'Digital',
    category: 'New Product Launch',
    tasks: ['']
  };
}

export function Settings() {
  const { user, userData } = useAuth();
  const role = userData?.role;
  const canManageSettings = role === 'admin';
  const canViewChecklistTemplates = role === 'admin' || role === 'supervisor';
  const canManageUsers = role === 'admin';
  const [loading, setLoading] = useState(true);
  // ... state ...
  const [saving, setSaving] = useState(false);
  // ... globals state ...
  const [globals, setGlobals] = useState({
    partnershipTarget: 30,
    displaySlotsTarget: 18,
    eventsTarget: 2,
    kebabTarget: 50,
    mascotTarget: 4,
    blogTarget: 10,
    socialTarget: 15,
    adBudget: 5000,
    totalMarketingBudget: 50000
  });

  const [outlets, setOutlets] = useState<any[]>([]);
  const [newOutlet, setNewOutlet] = useState({ name: '', baseSales: '' });
  const [checklistTemplates, setChecklistTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateForm, setTemplateForm] = useState<ChecklistTemplateFormState>(buildEmptyChecklistTemplateForm());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFeedback, setTemplateFeedback] = useState<TemplateFeedback | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<any | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<ManagedUserFormState | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userFeedback, setUserFeedback] = useState<UserFeedback | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUserRecord | null>(null);
  const [deletingManagedUser, setDeletingManagedUser] = useState(false);
  const [salesImportFeedback, setSalesImportFeedback] = useState<SalesImportFeedback | null>(null);
  const [salesImportPreview, setSalesImportPreview] = useState<SalesImportPreview | null>(null);
  const [parsedSalesImportRows, setParsedSalesImportRows] = useState<ParsedSalesImportRow[]>([]);
  const [isValidatingSalesImport, setIsValidatingSalesImport] = useState(false);
  const [isImportingSales, setIsImportingSales] = useState(false);
  const [budgetHistory, setBudgetHistory] = useState<BudgetHistoryRecord[]>([]);
  const [loadingBudgetHistory, setLoadingBudgetHistory] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Fetch Globals
    const fetchGlobals = async () => {
      try {
        const docRef = doc(db, 'settings', 'globals');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setGlobals(docSnap.data() as any);
        }
      } catch (err) {
        console.error("Error fetching globals:", err);
      } finally {
        setLoading(false);
      }
    };

    // Fetch Outlets
    const unsubscribeOutlets = onSnapshot(collection(db, 'outlets'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOutlets(list);
    }, (err) => {
      console.error("Error fetching outlets:", err);
    });

    fetchGlobals();
    return () => unsubscribeOutlets();
  }, [user]);

  useEffect(() => {
    if (!user || !canViewChecklistTemplates) {
      setChecklistTemplates([]);
      setLoadingTemplates(false);
      return;
    }

    setLoadingTemplates(true);
    const q = query(collection(db, 'checklistTemplates'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChecklistTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingTemplates(false);
    }, (err) => {
      console.error("Error fetching checklist templates:", err);
      setLoadingTemplates(false);
      setTemplateFeedback({ tone: 'error', message: 'Failed to load templates.' });
    });

    return () => unsubscribe();
  }, [user, canViewChecklistTemplates]);

  useEffect(() => {
    if (!user || !canManageUsers) {
      setManagedUsers([]);
      setLoadingUsers(false);
      return;
    }

    setLoadingUsers(true);
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const normalizedUsers = snapshot.docs
        .map((userDoc) => normalizeManagedUserRecord(userDoc.id, userDoc.data()))
        .filter((managedUser): managedUser is ManagedUserRecord => managedUser !== null)
        .sort((left, right) => left.email.localeCompare(right.email));

      setManagedUsers(normalizedUsers);
      setLoadingUsers(false);
    }, (error) => {
      console.error('Error fetching users:', error);
      setUserFeedback({ tone: 'error', message: 'Failed to load users.' });
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [user, canManageUsers]);

  useEffect(() => {
    if (!user || !canManageSettings) {
      setBudgetHistory([]);
      setLoadingBudgetHistory(false);
      return;
    }

    setLoadingBudgetHistory(true);
    const budgetHistoryQuery = query(
      collection(db, 'budgets'),
      orderBy('month_key', 'desc'),
      limit(12)
    );

    const unsubscribe = onSnapshot(budgetHistoryQuery, (snapshot) => {
      const normalizedBudgetHistory = snapshot.docs
        .map((budgetDoc) => {
          const budgetData = budgetDoc.data();
          return {
            id: budgetDoc.id,
            month_key: typeof budgetData.month_key === 'string' ? budgetData.month_key : budgetDoc.id,
            sales_rollup_total: typeof budgetData.sales_rollup_total === 'number' ? budgetData.sales_rollup_total : 0,
            marketing_budget_total: typeof budgetData.marketing_budget_total === 'number' ? budgetData.marketing_budget_total : 0,
            budget_rate: typeof budgetData.budget_rate === 'number' ? budgetData.budget_rate : 0.02,
            locked: budgetData.locked === true
          } satisfies BudgetHistoryRecord;
        })
        .sort((left, right) => right.month_key.localeCompare(left.month_key));

      setBudgetHistory(normalizedBudgetHistory);
      setLoadingBudgetHistory(false);
    }, (error) => {
      console.error('Error fetching budget history:', error);
      setSalesImportFeedback({
        tone: 'error',
        message: 'Failed to load history.'
      });
      setLoadingBudgetHistory(false);
    });

    return () => unsubscribe();
  }, [user, canManageSettings]);

  const handleGlobalSave = async () => {
    if (!user || !canManageSettings) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'globals'), {
        ...globals,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      alert('Settings saved.');
    } catch (error) {
      console.error('Error saving globals:', error);
      alert('Settings save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings || !newOutlet.name) return;
    try {
      await addDoc(collection(db, 'outlets'), {
        name: newOutlet.name,
        baseSales: Number(newOutlet.baseSales) || 0,
        isActive: true,
        order: outlets.length + 1,
        createdAt: serverTimestamp()
      });
      setNewOutlet({ name: '', baseSales: '' });
    } catch (error) {
      console.error('Error adding outlet:', error);
    }
  };

  const handleDeleteOutlet = async (id: string) => {
    if (!canManageSettings) return;
    if (!window.confirm('Are you sure you want to delete this outlet?')) return;
    try {
      await deleteDoc(doc(db, 'outlets', id));
    } catch (error) {
      console.error('Error deleting outlet:', error);
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm(buildEmptyChecklistTemplateForm());
    setEditingTemplateId(null);
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm(null);
  };

  const handleCreateUser = () => {
    if (!canManageUsers) return;
    setEditingUserId(null);
    setUserFeedback(null);
    setUserForm(buildEmptyUserFormState());
  };

  const handleEditUser = (managedUser: ManagedUserRecord) => {
    if (!canManageUsers) return;
    setEditingUserId(managedUser.id);
    setUserFeedback(null);
    setUserForm(buildUserFormState(managedUser));
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageUsers || !userForm) return;

    const email = userForm.email.trim().toLowerCase();
    const displayName = userForm.display_name.trim();
    const selectedOutlet = userForm.role === 'supervisor'
      ? outlets.find((outlet) => outlet.id === userForm.outlet_id) || null
      : null;
    const outletId = userForm.role === 'supervisor' && selectedOutlet ? selectedOutlet.id : '';
    const outletName = userForm.role === 'supervisor' && selectedOutlet && typeof selectedOutlet.name === 'string'
      ? selectedOutlet.name.trim()
      : '';
    const userDocId = editingUserId || email;
    const existingManagedUser = editingUserId
      ? managedUsers.find((managedUser) => managedUser.id === editingUserId) || null
      : null;

    if (!email) {
      setUserFeedback({ tone: 'error', message: 'Email is required.' });
      return;
    }

    if (!displayName) {
      setUserFeedback({ tone: 'error', message: 'Display name is required.' });
      return;
    }

    if (userForm.role === 'supervisor' && (!outletId || !outletName)) {
      setUserFeedback({ tone: 'error', message: 'Supervisors need an outlet from master data.' });
      return;
    }

    setSavingUser(true);
    setUserFeedback(null);
    try {
      const payload = {
        auth_uid: existingManagedUser?.auth_uid || '',
        email,
        display_name: displayName,
        role: userForm.role,
        outlet_id: outletId,
        outlet_name: outletName,
        outlet: outletName,
        status: userForm.status,
        photo_url: existingManagedUser?.photo_url || '',
        updatedAt: serverTimestamp()
      };

      if (editingUserId) {
        await updateDoc(doc(db, 'users', userDocId), payload);
      } else {
        const duplicateUser = managedUsers.find(
          (managedUser) => managedUser.id === userDocId || managedUser.email.toLowerCase() === email
        );

        if (duplicateUser) {
          throw new Error('A user profile for this email already exists.');
        }

        await setDoc(doc(db, 'users', userDocId), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setUserFeedback({
        tone: 'success',
        message: editingUserId
          ? `Updated ${email}.`
          : `Created profile for ${email}.`
      });
      resetUserForm();
    } catch (error) {
      console.error('Error saving managed user profile:', error);
      setUserFeedback({
        tone: 'error',
        message: getManagedUserErrorMessage(error, 'Failed to save this user profile.')
      });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteManagedUser = async () => {
    if (!canManageUsers || !deletingUser) return;

    const currentUserEmail = user?.email?.trim().toLowerCase() || '';
    if (deletingUser.id === user?.uid || (currentUserEmail && deletingUser.email.toLowerCase() === currentUserEmail)) {
      setUserFeedback({ tone: 'error', message: 'You cannot delete your own profile.' });
      setDeletingUser(null);
      return;
    }

    setDeletingManagedUser(true);
    setUserFeedback(null);
    try {
      await deleteDoc(doc(db, 'users', deletingUser.id));
      if (editingUserId === deletingUser.id) {
        resetUserForm();
      }
      setUserFeedback({
        tone: 'success',
        message: `${deletingUser.email || deletingUser.display_name} was removed.`
      });
      setDeletingUser(null);
    } catch (error) {
      console.error('Error deleting managed user:', error);
      setUserFeedback({
        tone: 'error',
        message: getManagedUserErrorMessage(error, 'Failed to delete this user profile.')
      });
    } finally {
      setDeletingManagedUser(false);
    }
  };

  const handleDownloadSalesTemplate = () => {
    const csvContent = `${SALES_IMPORT_HEADERS.join(',')}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'sales-import-template.csv';
    link.click();

    URL.revokeObjectURL(url);
  };

  const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  const normalizeSalesMonthKey = (value: string, rowNumber: number) => {
    const normalizedMonthKey = value.trim();
    if (!/^\d{4}-\d{2}$/.test(normalizedMonthKey)) {
      throw new Error(`Invalid month_key on row ${rowNumber}. Expected YYYY-MM.`);
    }

    return normalizedMonthKey;
  };

  const normalizeSalesNumber = (value: string, fieldName: string, rowNumber: number) => {
    const normalizedValue = value.replace(/,/g, '').trim();
    if (!normalizedValue) {
      throw new Error(`Missing ${fieldName} on row ${rowNumber}.`);
    }

    const parsedValue = Number(normalizedValue);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      throw new Error(`Invalid ${fieldName} on row ${rowNumber}.`);
    }

    return roundCurrency(parsedValue);
  };

  const parseSalesCsvRow = (rawRow: string) => {
    const parsedCells: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let index = 0; index < rawRow.length; index += 1) {
      const currentChar = rawRow[index];
      const nextChar = rawRow[index + 1];

      if (currentChar === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (currentChar === ',' && !inQuotes) {
        parsedCells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += currentChar;
      }
    }

    parsedCells.push(currentCell.trim());
    return parsedCells;
  };

  const handleSalesImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canManageSettings) return;

    setIsValidatingSalesImport(true);
    setSalesImportFeedback(null);
    setSalesImportPreview(null);
    setParsedSalesImportRows([]);

    try {
      const csvText = (await file.text()).replace(/^\uFEFF/, '');
      const [headerLine = '', ...rows] = csvText.split(/\r?\n/);
      const parsedHeaders = parseSalesCsvRow(headerLine);
      const expectedHeaders = [...SALES_IMPORT_HEADERS];

      const hasExactHeaders =
        parsedHeaders.length === expectedHeaders.length &&
        parsedHeaders.every((header, index) => header === expectedHeaders[index]);

      if (!hasExactHeaders) {
        throw new Error(`Invalid CSV headers. Expected: ${expectedHeaders.join(', ')}`);
      }

      const normalizedRows = rows.filter((row) => row.trim().length > 0);
      if (normalizedRows.length === 0) {
        throw new Error('The CSV file does not contain any data rows.');
      }

      const parsedRows = normalizedRows.map((row, index) => {
        const rowNumber = index + 2;
        const cells = parseSalesCsvRow(row);
        if (cells.length !== SALES_IMPORT_HEADERS.length) {
          throw new Error(`Invalid column count on row ${rowNumber}.`);
        }

        const [
          rawMonthKey,
          rawOutletId,
          rawOutletName,
          rawTotalSales,
          rawGrabGrossOrderValue,
          rawGrabCommissionFees,
          rawGrabAdSpend,
          rawFoodpandaGrossOrderValue,
          rawFoodpandaCommissionFees,
          rawFoodpandaAdSpend
        ] = cells;

        const outletId = rawOutletId.trim();
        if (!outletId) {
          throw new Error(`Missing outlet_id on row ${rowNumber}.`);
        }

        const matchedOutlet = outlets.find((outlet) => outlet.id === outletId) || null;
        if (!matchedOutlet || typeof matchedOutlet.name !== 'string' || !matchedOutlet.name.trim()) {
          throw new Error(`Unknown outlet_id on row ${rowNumber}.`);
        }

        if (!rawOutletName.trim()) {
          throw new Error(`Missing outlet_name on row ${rowNumber}.`);
        }

        return {
          month_key: normalizeSalesMonthKey(rawMonthKey, rowNumber),
          outlet_id: outletId,
          outlet_name: matchedOutlet.name.trim(),
          total_sales: normalizeSalesNumber(rawTotalSales, 'total_sales', rowNumber),
          grab_gross_order_value: normalizeSalesNumber(rawGrabGrossOrderValue, 'grab_gross_order_value', rowNumber),
          grab_commission_fees: normalizeSalesNumber(rawGrabCommissionFees, 'grab_commission_fees', rowNumber),
          grab_ad_spend: normalizeSalesNumber(rawGrabAdSpend, 'grab_ad_spend', rowNumber),
          foodpanda_gross_order_value: normalizeSalesNumber(rawFoodpandaGrossOrderValue, 'foodpanda_gross_order_value', rowNumber),
          foodpanda_commission_fees: normalizeSalesNumber(rawFoodpandaCommissionFees, 'foodpanda_commission_fees', rowNumber),
          foodpanda_ad_spend: normalizeSalesNumber(rawFoodpandaAdSpend, 'foodpanda_ad_spend', rowNumber)
        };
      });

      const monthKeys = [...new Set(parsedRows.map((row) => row.month_key))].sort();

      setParsedSalesImportRows(parsedRows);
      setSalesImportPreview({
        fileName: file.name,
        rowCount: parsedRows.length,
        monthKeys
      });
      setSalesImportFeedback({
        tone: 'success',
        message: `CSV checked. ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'} ready.`
      });
    } catch (error) {
      setSalesImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to read this CSV file.'
      });
    } finally {
      event.target.value = '';
      setIsValidatingSalesImport(false);
    }
  };

  const handleCommitSalesImport = async () => {
    if (!user || !canManageSettings || !salesImportPreview || parsedSalesImportRows.length === 0) return;

    setIsImportingSales(true);
    setSalesImportFeedback(null);

    try {
      const batch = writeBatch(db);
      const csvBatchId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sales-import-${Date.now()}`;
      const salesDocMap = new Map<string, ParsedSalesImportRow>();
      const monthlyRollupMap = new Map<string, number>();

      parsedSalesImportRows.forEach((row) => {
        const salesDocId = `${row.month_key}__${row.outlet_id}`;
        const existingSalesDoc = salesDocMap.get(salesDocId);

        if (existingSalesDoc) {
          const nextSalesDoc = {
            ...existingSalesDoc,
            total_sales: roundCurrency(existingSalesDoc.total_sales + row.total_sales),
            grab_gross_order_value: roundCurrency(existingSalesDoc.grab_gross_order_value + row.grab_gross_order_value),
            grab_commission_fees: roundCurrency(existingSalesDoc.grab_commission_fees + row.grab_commission_fees),
            grab_ad_spend: roundCurrency(existingSalesDoc.grab_ad_spend + row.grab_ad_spend),
            foodpanda_gross_order_value: roundCurrency(existingSalesDoc.foodpanda_gross_order_value + row.foodpanda_gross_order_value),
            foodpanda_commission_fees: roundCurrency(existingSalesDoc.foodpanda_commission_fees + row.foodpanda_commission_fees),
            foodpanda_ad_spend: roundCurrency(existingSalesDoc.foodpanda_ad_spend + row.foodpanda_ad_spend)
          };

          salesDocMap.set(salesDocId, nextSalesDoc);
        } else {
          salesDocMap.set(salesDocId, { ...row });
        }

        const currentMonthSales = monthlyRollupMap.get(row.month_key) || 0;
        monthlyRollupMap.set(row.month_key, roundCurrency(currentMonthSales + row.total_sales));
      });

      salesDocMap.forEach((salesRow, salesDocId) => {
        const salesPayload = {
          month_key: salesRow.month_key,
          outlet_id: salesRow.outlet_id,
          outlet_name: salesRow.outlet_name,
          total_sales: salesRow.total_sales,
          grab_gross_order_value: salesRow.grab_gross_order_value,
          grab_commission_fees: salesRow.grab_commission_fees,
          grab_ad_spend: salesRow.grab_ad_spend,
          grab_net_profit: roundCurrency(
            salesRow.grab_gross_order_value - salesRow.grab_commission_fees - salesRow.grab_ad_spend
          ),
          foodpanda_gross_order_value: salesRow.foodpanda_gross_order_value,
          foodpanda_commission_fees: salesRow.foodpanda_commission_fees,
          foodpanda_ad_spend: salesRow.foodpanda_ad_spend,
          foodpanda_net_profit: roundCurrency(
            salesRow.foodpanda_gross_order_value - salesRow.foodpanda_commission_fees - salesRow.foodpanda_ad_spend
          ),
          source_file_name: salesImportPreview.fileName,
          source_batch_id: csvBatchId,
          imported_by_uid: user.uid,
          imported_at: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        batch.set(doc(db, 'sales', salesDocId), salesPayload);
      });

      monthlyRollupMap.forEach((salesRollupTotal, monthKey) => {
        const budgetPayload = {
          month_key: monthKey,
          sales_rollup_total: salesRollupTotal,
          budget_rate: 0.02,
          marketing_budget_total: roundCurrency(salesRollupTotal * 0.02),
          locked: true,
          locked_at: serverTimestamp(),
          source_batch_ids: [csvBatchId],
          source_file_name: salesImportPreview.fileName,
          calculated_by_uid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        batch.set(doc(db, 'budgets', monthKey), budgetPayload);
      });

      await batch.commit();

      setParsedSalesImportRows([]);
      setSalesImportPreview(null);
      setSalesImportFeedback({
        tone: 'success',
        message: `Import complete. ${salesDocMap.size} sales doc${salesDocMap.size === 1 ? '' : 's'} and ${monthlyRollupMap.size} budget doc${monthlyRollupMap.size === 1 ? '' : 's'} saved.`
      });
    } catch (error) {
      console.error('Error importing sales data:', error);
      setSalesImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Import failed.'
      });
    } finally {
      setIsImportingSales(false);
    }
  };

  const handleChecklistTaskChange = (index: number, value: string) => {
    setTemplateForm(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, taskIndex) => taskIndex === index ? value : task)
    }));
  };

  const handleAddChecklistTask = () => {
    setTemplateForm(prev => ({
      ...prev,
      tasks: [...prev.tasks, '']
    }));
  };

  const handleRemoveChecklistTask = (index: number) => {
    setTemplateForm(prev => {
      if (prev.tasks.length === 1) {
        return {
          ...prev,
          tasks: ['']
        };
      }

      return {
        ...prev,
        tasks: prev.tasks.filter((_, taskIndex) => taskIndex !== index)
      };
    });
  };

  const handleEditTemplate = (template: any) => {
    if (!canManageSettings) return;

    setEditingTemplateId(template.id);
    setTemplateFeedback(null);
    setTemplateForm({
      name: typeof template.name === 'string' ? template.name : '',
      type: CHECKLIST_TEMPLATE_TYPES.includes(template.type) ? template.type : 'Digital',
      category: CHECKLIST_TEMPLATE_CATEGORIES.includes(template.category) ? template.category : 'New Product Launch',
      tasks: Array.isArray(template.tasks) && template.tasks.length > 0
        ? template.tasks.map((task: unknown) => typeof task === 'string' ? task : '')
        : ['']
    });
  };

  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageSettings) return;

    const name = templateForm.name.trim();
    const tasks = templateForm.tasks.map(task => task.trim()).filter(Boolean);
    if (!name) {
      setTemplateFeedback({ tone: 'error', message: 'Name is required.' });
      return;
    }

    if (tasks.length === 0) {
      setTemplateFeedback({ tone: 'error', message: 'Add at least one step.' });
      return;
    }

    setSavingTemplate(true);
    setTemplateFeedback(null);
    try {
      if (editingTemplateId) {
        await updateDoc(doc(db, 'checklistTemplates', editingTemplateId), {
          name,
          type: templateForm.type,
          category: templateForm.category,
          tasks,
          updatedAt: serverTimestamp()
        });
        setTemplateFeedback({ tone: 'success', message: 'Template updated.' });
      } else {
        await addDoc(collection(db, 'checklistTemplates'), {
          name,
          type: templateForm.type,
          category: templateForm.category,
          tasks,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setTemplateFeedback({ tone: 'success', message: 'Template created.' });
      }

      resetTemplateForm();
    } catch (error) {
      console.error('Error saving checklist template:', error);
      setTemplateFeedback({ tone: 'error', message: 'Template save failed.' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate || !canManageSettings) return;

    setSavingTemplate(true);
    try {
      await deleteDoc(doc(db, 'checklistTemplates', deletingTemplate.id));
      setTemplateFeedback({ tone: 'success', message: 'Template deleted.' });
      if (editingTemplateId === deletingTemplate.id) {
        resetTemplateForm();
      }
      setDeletingTemplate(null);
    } catch (error) {
      console.error('Error deleting checklist template:', error);
      setTemplateFeedback({ tone: 'error', message: 'Delete failed.' });
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  const selectedManagedOutlet = userForm?.role === 'supervisor'
    ? outlets.find((outlet) => outlet.id === userForm.outlet_id) || null
    : null;
  const hasLegacyManagedOutlet = Boolean(
    userForm?.role === 'supervisor' &&
    userForm.outlet_id &&
    !selectedManagedOutlet
  );

  const kpiFields = [
    { key: 'partnershipTarget', label: 'Partnership Target', icon: Handshake, color: 'text-indigo-500' },
    { key: 'displaySlotsTarget', label: 'Display Slots Target', icon: MonitorPlay, color: 'text-blue-500' },
    { key: 'eventsTarget', label: 'Monthly Events Target', icon: Calendar, color: 'text-emerald-500' },
    { key: 'kebabTarget', label: 'Kebab Giveaway Target', icon: Gift, color: 'text-amber-500' },
    { key: 'mascotTarget', label: 'Weekly Mascot Appearances', icon: Smile, color: 'text-rose-500' },
    { key: 'blogTarget', label: 'Blog Features Target', icon: BookOpen, color: 'text-cyan-500' },
    { key: 'socialTarget', label: 'Monthly Social Target', icon: Share2, color: 'text-fuchsia-500' },
    { key: 'adBudget', label: 'Ad Spend Budget ($)', icon: DollarSign, color: 'text-violet-500' },
    { key: 'totalMarketingBudget', label: 'Total Marketing Budget ($)', icon: DollarSign, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-8 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Settings</h1>
          <p className="text-neutral-500 mt-1">Manage targets, outlets, users, and templates.</p>
        </div>
        {canManageSettings ? (
          <button 
            onClick={handleGlobalSave}
            disabled={saving}
            className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save size={20} />}
            Save Targets
          </button>
        ) : (
          <span className="text-sm font-medium text-neutral-500">Admin only</span>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* KPI SETTINGS */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
        >
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
            <Target className="w-6 h-6 text-rose-500" />
            KPI Targets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {kpiFields.map((field) => (
              <div key={field.key} className="space-y-1.5 focus-within:ring-2 focus-within:ring-rose-500 rounded-lg transition-all p-1">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                  <field.icon className={`w-4 h-4 ${field.color}`} />
                  {field.label}
                </label>
                <input 
                  type="number"
                  value={(globals as any)[field.key]}
                  onChange={(e) => setGlobals({ ...globals, [field.key]: Number(e.target.value) })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-lg font-bold text-neutral-900 outline-none transition-all placeholder:text-neutral-300 focus:bg-white"
                />
              </div>
            ))}
          </div>
        </motion.section>

        {/* OUTLET MANAGEMENT */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
        >
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-500" />
            Outlets
          </h2>

          {canManageSettings ? (
            <form onSubmit={handleAddOutlet} className="mb-8 p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input 
                    required
                    type="text" 
                    placeholder="Outlet name" 
                    value={newOutlet.name}
                    onChange={e => setNewOutlet({...newOutlet, name: e.target.value})}
                    className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input 
                    type="number" 
                    placeholder="Base sales" 
                    value={newOutlet.baseSales}
                    onChange={e => setNewOutlet({...newOutlet, baseSales: e.target.value})}
                    className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
               </div>
               <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                  <Plus size={18} /> Add Outlet
               </button>
            </form>
          ) : (
            <div className="mb-8 p-4 bg-neutral-50 rounded-2xl border border-neutral-100 text-sm text-neutral-500">
              Admins only.
            </div>
          )}

          <div className="divide-y divide-neutral-100">
             {outlets.sort((a,b) => a.order - b.order).map(outlet => (
                <div key={outlet.id} className="py-4 flex items-center justify-between group">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 font-bold">
                         {outlet.name.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-neutral-900">{outlet.name}</p>
                        <p className="text-xs text-neutral-500">Base sales: ${Number(outlet.baseSales).toLocaleString()}</p>
                      </div>
                   </div>
                   {canManageSettings && (
                     <button 
                      onClick={() => handleDeleteOutlet(outlet.id)}
                      className="p-2 text-neutral-300 hover:text-rose-500 transition-colors"
                     >
                       <Trash2 size={18} />
                     </button>
                   )}
                </div>
             ))}
             {outlets.length === 0 && (
               <div className="py-12 text-center">
                  <p className="text-neutral-400 text-sm">No outlets yet.</p>
               </div>
             )}
          </div>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-violet-500" />
              User Directory
            </h2>
            <p className="text-sm text-neutral-500 mt-1">Manage user profiles. New users can sign up later with the same email.</p>
          </div>
          {canManageUsers && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCreateUser}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 border border-violet-600 rounded-xl hover:bg-violet-700 transition-colors"
              >
                <Plus size={16} />
                New User
              </button>
              {userForm && (
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors"
                >
                  <X size={16} />
                  Close
                </button>
              )}
            </div>
          )}
        </div>

        {userFeedback && (
          <div className={`mb-6 rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
            userFeedback.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <p className="text-sm font-medium">{userFeedback.message}</p>
            <button
              type="button"
              onClick={() => setUserFeedback(null)}
              className={`transition-colors ${
                userFeedback.tone === 'success'
                  ? 'text-emerald-500 hover:text-emerald-700'
                  : 'text-rose-500 hover:text-rose-700'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!canManageUsers ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
            Admins only.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-8">
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
              <div className="mb-5">
                <h3 className="font-bold text-neutral-900">{editingUserId ? 'Edit User' : userForm ? 'New User' : 'Start User'}</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  {editingUserId
                    ? 'Update role, outlet, and status.'
                    : userForm
                      ? 'Create the profile now. Sign-up can happen later with the same email.'
                      : 'Pick a user to edit, or create a new profile.'}
                </p>
              </div>

              {userForm ? (
                <form onSubmit={handleUserSubmit} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Email *</label>
                    <input
                      required
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      disabled={savingUser || Boolean(editingUserId)}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                      placeholder="name@company.com"
                    />
                    <p className="text-xs text-neutral-500">
                      {editingUserId
                        ? 'Email is locked after create.'
                        : 'Creates the profile now. Sign-up can happen later with the same email.'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Display Name *</label>
                    <input
                      required
                      type="text"
                      value={userForm.display_name}
                      onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })}
                      disabled={savingUser}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Role *</label>
                      <select
                        value={userForm.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as ManagedUserRole;
                          setUserForm({
                            ...userForm,
                            role: nextRole,
                            outlet_id: nextRole === 'supervisor' ? userForm.outlet_id : '',
                            outlet_name: nextRole === 'supervisor' ? userForm.outlet_name : ''
                          });
                        }}
                        disabled={savingUser}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                      >
                        <option value="admin">Admin</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="finance">Finance</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Status *</label>
                      <select
                        value={userForm.status}
                        onChange={(e) => setUserForm({ ...userForm, status: e.target.value as ManagedUserStatus })}
                        disabled={savingUser}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                      >
                        <option value="active">Active</option>
                        <option value="invited">Invited</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outlet</label>
                      <select
                        value={userForm.outlet_id}
                        onChange={(e) => {
                          const nextOutletId = e.target.value;
                          const nextOutlet = outlets.find((outlet) => outlet.id === nextOutletId) || null;
                          setUserForm({
                            ...userForm,
                            outlet_id: nextOutletId,
                            outlet_name: nextOutlet && typeof nextOutlet.name === 'string'
                              ? nextOutlet.name
                              : ''
                          });
                        }}
                        disabled={savingUser || userForm.role !== 'supervisor'}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                      >
                        <option value="">Select outlet</option>
                        {hasLegacyManagedOutlet && (
                          <option value={userForm.outlet_id}>
                            Legacy ({userForm.outlet_name || userForm.outlet_id})
                          </option>
                        )}
                        {outlets.map((outlet) => (
                          <option key={outlet.id} value={outlet.id}>
                            {outlet.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-neutral-500">
                        Uses outlet master data.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outlet Name</label>
                      <input
                        type="text"
                        value={selectedManagedOutlet?.name || userForm.outlet_name}
                        readOnly
                        disabled
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-neutral-100"
                        placeholder="Select outlet first"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                    {editingUserId && editingUserId !== user?.uid && userForm.email.trim().toLowerCase() !== (user?.email?.trim().toLowerCase() || '') && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetUser = managedUsers.find((managedUser) => managedUser.id === editingUserId);
                          if (targetUser) {
                            setDeletingUser(targetUser);
                          }
                        }}
                        disabled={savingUser}
                        className="mr-auto px-5 py-2.5 text-rose-700 font-medium bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetUserForm}
                      disabled={savingUser}
                      className="px-5 py-2.5 text-neutral-600 font-medium hover:bg-neutral-200 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingUser}
                      className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      {savingUser ? 'Saving...' : editingUserId ? 'Save' : 'Create'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center">
                  <Users className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-base font-semibold text-neutral-900">No user selected</p>
                  <p className="text-sm text-neutral-500 mt-1">Pick a user or create a new profile.</p>
                  <button
                    type="button"
                    onClick={handleCreateUser}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors"
                  >
                    <Plus size={16} />
                    New User
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-neutral-900">Directory</h3>
                  <p className="text-sm text-neutral-500 mt-1">Sorted by email.</p>
                </div>
                <div className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
                  {managedUsers.length} Users
                </div>
              </div>

              {loadingUsers ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-500">
                  Loading users...
                </div>
              ) : managedUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
                  <Users className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-base font-semibold text-neutral-900">No users yet</p>
                  <p className="text-sm text-neutral-500 mt-1">Create the first profile to assign roles and outlets.</p>
                </div>
              ) : (
                managedUsers.map((managedUser) => (
                  <div key={managedUser.id} className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-neutral-900">{managedUser.display_name || managedUser.email}</h4>
                        <p className="text-sm text-neutral-500 mt-1">{managedUser.email}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                            {managedUser.role}
                          </span>
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                            getManagedUserProvisioningState(managedUser) === 'claimed'
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {getManagedUserProvisioningState(managedUser)}
                          </span>
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                            managedUser.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : managedUser.status === 'invited'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                          }`}>
                            {managedUser.status}
                          </span>
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">
                            {managedUser.outlet_name || 'No outlet'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditUser(managedUser)}
                          className="p-2.5 text-neutral-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                        {managedUser.id !== user?.uid && managedUser.email.toLowerCase() !== (user?.email?.trim().toLowerCase() || '') && (
                          <button
                            type="button"
                            onClick={() => setDeletingUser(managedUser)}
                            className="p-2.5 text-neutral-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.13 }}
        className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-500" />
              Sales vs Budget
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Last 12 locked months.
            </p>
          </div>
          <div className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
            {budgetHistory.length} Months
          </div>
        </div>

        {!canManageSettings ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
            Admins only.
          </div>
        ) : loadingBudgetHistory ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-500">
            Loading history...
          </div>
        ) : budgetHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
            <DollarSign className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-neutral-900">No history yet</p>
            <p className="text-sm text-neutral-500 mt-1">
              Import sales to start tracking budget history.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-100 overflow-hidden">
            <div className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.8fr] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <span>Month</span>
              <span>Sales</span>
              <span>Budget</span>
              <span>Rate</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-neutral-100">
              {budgetHistory.map((budgetRecord) => (
                <div
                  key={budgetRecord.id}
                  className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.8fr] gap-4 px-5 py-4 items-center text-sm"
                >
                  <div>
                    <p className="font-semibold text-neutral-900">{budgetRecord.month_key}</p>
                    <p className="text-xs text-neutral-400 mt-1">Locked month</p>
                  </div>
                  <p className="font-medium text-neutral-900">
                    {budgetCurrencyFormatter.format(budgetRecord.sales_rollup_total)}
                  </p>
                  <p className="font-medium text-emerald-700">
                    {budgetCurrencyFormatter.format(budgetRecord.marketing_budget_total)}
                  </p>
                  <p className="text-neutral-600">{(budgetRecord.budget_rate * 100).toFixed(0)}%</p>
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      budgetRecord.locked
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {budgetRecord.locked ? 'Locked' : 'Draft'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-500" />
              Sales Import
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Download the template and validate before import.
            </p>
          </div>

          {canManageSettings && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleDownloadSalesTemplate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors"
              >
                <Download size={16} />
                Download Template
              </button>

              <label className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
                isValidatingSalesImport
                  ? 'bg-emerald-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
              }`}>
                <Upload size={16} />
                {isValidatingSalesImport ? 'Checking...' : 'Upload CSV'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleSalesImportFileChange}
                  disabled={isValidatingSalesImport}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {salesImportFeedback && (
          <div className={`mb-6 rounded-xl border px-4 py-3 ${
            salesImportFeedback.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <p className="text-sm font-medium">{salesImportFeedback.message}</p>
          </div>
        )}

        {!canManageSettings ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
            Admins only.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-8">
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
              <h3 className="font-bold text-neutral-900">CSV Headers</h3>
              <p className="text-sm text-neutral-500 mt-1">
                File columns must match this order.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {SALES_IMPORT_HEADERS.map((header) => (
                  <span
                    key={header}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-neutral-200 text-neutral-600"
                  >
                    {header}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
              <h3 className="font-bold text-neutral-900">Validation</h3>
              <p className="text-sm text-neutral-500 mt-1">
                This only checks the file. Nothing is written yet.
              </p>

              {salesImportPreview ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">File</p>
                    <p className="text-sm font-medium text-neutral-900 mt-1">{salesImportPreview.fileName}</p>
                  </div>
                  <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Rows</p>
                    <p className="text-sm font-medium text-neutral-900 mt-1">{salesImportPreview.rowCount}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-sm text-neutral-500">
                  No file checked yet.
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleCommitSalesImport}
                  disabled={!salesImportPreview || parsedSalesImportRows.length === 0 || isValidatingSalesImport || isImportingSales}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 border border-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:bg-emerald-300 disabled:border-emerald-300 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                  {isImportingSales ? 'Importing...' : 'Import CSV'}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-sky-500" />
            Templates
          </h2>
          <p className="text-sm text-neutral-500 mt-1">Reusable task lists for campaigns.</p>
          </div>
          {canManageSettings && editingTemplateId && (
            <button
              type="button"
              onClick={resetTemplateForm}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors"
            >
              <Plus size={16} />
              New
            </button>
          )}
        </div>

        {templateFeedback && (
          <div className={`mb-6 rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
            templateFeedback.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <p className="text-sm font-medium">{templateFeedback.message}</p>
            <button
              type="button"
              onClick={() => setTemplateFeedback(null)}
              className={`transition-colors ${
                templateFeedback.tone === 'success'
                  ? 'text-emerald-500 hover:text-emerald-700'
                  : 'text-rose-500 hover:text-rose-700'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!canViewChecklistTemplates ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
            Admins and supervisors only.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-8">
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="font-bold text-neutral-900">{editingTemplateId ? 'Edit Template' : 'New Template'}</h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {editingTemplateId ? 'Update a reusable checklist.' : 'Build a checklist teams can reuse.'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleTemplateSubmit} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-neutral-700">Name *</label>
                  <input
                    required
                    type="text"
                    value={templateForm.name}
                    onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                    disabled={!canManageSettings || savingTemplate}
                    className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-neutral-100"
                    placeholder="e.g. KOL Visit"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Type *</label>
                    <select
                      value={templateForm.type}
                      onChange={e => setTemplateForm({ ...templateForm, type: e.target.value as ChecklistTemplateType })}
                      disabled={!canManageSettings || savingTemplate}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-neutral-100"
                    >
                      {CHECKLIST_TEMPLATE_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Category *</label>
                    <select
                      value={templateForm.category}
                      onChange={e => setTemplateForm({ ...templateForm, category: e.target.value as ChecklistTemplateCategory })}
                      disabled={!canManageSettings || savingTemplate}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-neutral-100"
                    >
                      {CHECKLIST_TEMPLATE_CATEGORIES.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <label className="text-sm font-medium text-neutral-700">Tasks *</label>
                      <p className="text-xs text-neutral-500 mt-0.5">Steps teams can reuse.</p>
                    </div>
                    {canManageSettings && (
                      <button
                        type="button"
                        onClick={handleAddChecklistTask}
                        disabled={savingTemplate}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50"
                      >
                        <Plus size={14} />
                        Add step
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {templateForm.tasks.map((task, index) => (
                      <div key={`${editingTemplateId || 'new'}-task-${index}`} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 text-xs font-bold text-neutral-500 flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <input
                          type="text"
                          value={task}
                          onChange={e => handleChecklistTaskChange(index, e.target.value)}
                          disabled={!canManageSettings || savingTemplate}
                          className="flex-1 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-neutral-100"
                          placeholder={`Task ${index + 1}`}
                        />
                        {canManageSettings && (
                          <button
                            type="button"
                            onClick={() => handleRemoveChecklistTask(index)}
                            disabled={savingTemplate}
                            className="p-2.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {canManageSettings ? (
                  <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={resetTemplateForm}
                      disabled={savingTemplate}
                      className="px-5 py-2.5 text-neutral-600 font-medium hover:bg-neutral-200 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      type="submit"
                      disabled={savingTemplate}
                      className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                      {savingTemplate ? 'Saving...' : editingTemplateId ? 'Update Template' : 'Save Template'}
                    </button>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-neutral-200 text-sm text-neutral-500">
                    Supervisors can view only.
                  </div>
                )}
              </form>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-neutral-900">Library</h3>
                  <p className="text-sm text-neutral-500 mt-1">Saved in master data.</p>
                </div>
                <div className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
                  {checklistTemplates.length} Templates
                </div>
              </div>

              {loadingTemplates ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-500">
                  Loading templates...
                </div>
              ) : checklistTemplates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
                  <CheckSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-base font-semibold text-neutral-900">No templates yet</p>
                  <p className="text-sm text-neutral-500 mt-1">Create the first template to standardize setup.</p>
                </div>
              ) : (
                checklistTemplates.map((template) => (
                  <div key={template.id} className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-neutral-900">{template.name}</h4>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">
                            {template.type}
                          </span>
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">
                            {template.category}
                          </span>
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            {Array.isArray(template.tasks) ? template.tasks.length : 0} Tasks
                          </span>
                        </div>
                      </div>

                      {canManageSettings && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTemplate(template)}
                            className="p-2.5 text-neutral-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTemplate(template)}
                            className="p-2.5 text-neutral-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      {Array.isArray(template.tasks) && template.tasks.length > 0 ? (
                        template.tasks.slice(0, 4).map((task: string, index: number) => (
                          <div key={`${template.id}-preview-${index}`} className="flex items-start gap-3 text-sm text-neutral-600">
                            <div className="w-6 h-6 rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-500 flex items-center justify-center shrink-0 mt-0.5">
                              {index + 1}
                            </div>
                            <p className="leading-6">{task}</p>
                          </div>
                        ))
                      ) : (
                  <p className="text-sm text-neutral-400">No steps yet.</p>
                      )}

                      {Array.isArray(template.tasks) && template.tasks.length > 4 && (
                        <p className="text-xs font-medium text-neutral-400 pl-9">
                          +{template.tasks.length - 4} more tasks
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </motion.section>

      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
         <SettingsIcon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
         <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">Admin Warning</p>
            <p>These values affect KPIs and budget signals across the workspace. Confirm with finance before saving.</p>
         </div>
      </div>

      <AnimatePresence>
        {deletingUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!deletingManagedUser) {
                  setDeletingUser(null);
                }
              }}
              className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900">Delete User</h3>
                <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                  This will remove <span className="font-semibold text-neutral-800">{deletingUser.email}</span> from user management.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeletingUser(null)}
                    className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-100 rounded-lg transition-colors"
                    disabled={deletingManagedUser}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteManagedUser}
                    disabled={deletingManagedUser}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                  >
                    {deletingManagedUser ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {deletingTemplate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!savingTemplate) {
                  setDeletingTemplate(null);
                }
              }}
              className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900">Delete Template</h3>
                <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                  This will remove <span className="font-semibold text-neutral-800">{deletingTemplate.name}</span> from master data.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeletingTemplate(null)}
                    className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-100 rounded-lg transition-colors"
                    disabled={savingTemplate}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTemplate}
                    disabled={savingTemplate}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                  >
                    {savingTemplate ? 'Deleting...' : 'Delete'}
                </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
