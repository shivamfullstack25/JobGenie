import { useState, useEffect } from "react";
import {useMutation} from "@tanstack/react-query";
import {useLocation} from "wouter";
import {apiRequest} from "@/lib/queryClient";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Switch} from "@/components/ui/switch";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {useToast} from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import {
    Download,
    Eye,
    Github,
    Globe,
    Linkedin,
    Lock,
    Mail,
    MapPin,
    Phone,
    Save,
    Settings,
    Shield,
    Trash2,
    Upload,
    User
} from "lucide-react";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Cropper, { type Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import getCroppedImg from '../utils/cropImage';
import { useAuth } from "../context/AuthContext";

const db = getFirestore();
const storage = getStorage();

export default function Profile() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    bio: "",
    phoneNumber: "",
    location: "",
    website: "",
    linkedinUrl: "",
    githubUrl: "",
  });

  const [settings, setSettings] = useState({
    theme: "light",
    notifications: true,
    emailUpdates: true,
    twoFactorEnabled: false,
    privacy: {
      profileVisible: true,
      emailVisible: false,
      phoneVisible: false,
    }
  });

  const [profilePic, setProfilePic] = useState<string>("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [fields, setFields] = useState<{ [key: string]: boolean }>({});
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const { user, backendUser, logout, refreshBackendUser } = useAuth();
  const [, navigate] = useLocation();

  const onCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const localUser = user;
      // Firestore is only still consulted here for fields the user-service record has no
      // equivalent for (profile picture, resume link) — everything else now prefers
      // backendUser (the real user-service/PostgreSQL record from AuthContext) so this page
      // reflects actual backend state instead of a Firestore-only copy that the "Save Changes"
      // button used to write to without ever touching the backend.
      let data: any = {};
      if (localUser) {
        const userRef = doc(db, "users", localUser.uid);
        const userSnap = await getDoc(userRef);
        data = userSnap.data() || {};
      }
      const computedFields = {
        name: !!(backendUser?.firstName || data.firstName) && !!(backendUser?.lastName || data.lastName),
        email: !!(backendUser?.email || data.email || localUser?.email),
        phone: !!(backendUser?.phone || backendUser?.phoneNumber || data.phone),
        location: !!(backendUser?.location || data.location),
        resumeUrl: !!data.resumeUrl,
        linkedin: !!(backendUser?.linkedinUrl || data.linkedinUrl),
        github: !!(backendUser?.githubUrl || data.githubUrl),
        photo: !!(data.photoURL || localUser?.photoURL),
      };
      setProfileData({
        firstName: backendUser?.firstName || data.firstName || "",
        lastName: backendUser?.lastName || data.lastName || "",
        email: backendUser?.email || data.email || localUser?.email || "",
        bio: backendUser?.bio || data.bio || "",
        phoneNumber: backendUser?.phone || backendUser?.phoneNumber || data.phone || "",
        location: backendUser?.location || data.location || "",
        website: backendUser?.website || data.website || "",
        linkedinUrl: backendUser?.linkedinUrl || data.linkedinUrl || "",
        githubUrl: backendUser?.githubUrl || data.githubUrl || "",
      });
      setProfilePic(data.photoURL || localUser?.photoURL || "");
      setFields(computedFields);
      // Compute progress from the freshly-computed fields directly rather than the `fields`
      // state variable, which wouldn't reflect this same setFields call until the next render.
      setProgress(
        (Object.values(computedFields).filter(Boolean).length / Object.keys(computedFields).length) * 100,
      );
      setProfileLoading(false);
    };
    fetchProfile();
  }, [backendUser, user]);

  // Update profile mutation. Backend requires ?userId= on PUT /api/profile
  // (ProfileController.updateProfile) — this previously called the endpoint with no userId at
  // all, which the backend rejected, and the "Save Changes" button never actually invoked this
  // mutation anyway (see handleSaveProfile below), so profile edits never reached user-service.
  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!backendUser?.id) throw new Error("You must be logged in to update your profile");
      return await apiRequest(`/api/profile?userId=${backendUser.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditing(false);
      refreshBackendUser();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update settings mutation (same missing-userId issue as above).
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!backendUser?.id) throw new Error("You must be logged in to update your settings");
      return await apiRequest(`/api/profile/settings?userId=${backendUser.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Your settings have been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Export my account data (user-service profile only)
  const exportDataMutation = useMutation({
    mutationFn: async () => {
      if (!backendUser?.id) throw new Error("You must be logged in to export your data");
      const res = await apiRequest(`/api/users/me/export?userId=${backendUser.id}`, {
        method: "GET",
      });
      return res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jobgenie-account-data-${backendUser?.id ?? "export"}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Data exported",
        description: "Your account data has been downloaded as a JSON file.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error?.message || "Could not export your data. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Permanently delete my account (self-service, not the admin-only delete)
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!backendUser?.id) throw new Error("You must be logged in to delete your account");
      return await apiRequest(`/api/users/me?userId=${backendUser.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      toast({
        title: "Account deleted",
        description: "Your account and associated data have been removed.",
      });
      setDeleteConfirmText("");
      try {
        await logout();
      } finally {
        navigate("/");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error?.message || "Could not delete your account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = async () => {
    // Previously this only wrote to Firestore and never called the backend at all — the
    // updateProfileMutation above (PUT /api/profile) was defined but never invoked, so "Save
    // Changes" silently never persisted anything to the real user-service/PostgreSQL record
    // that backendUser (and the rest of the app) reads. Now it does both: Firestore is kept as
    // a best-effort mirror since dashboard.tsx still reads this same doc, and the backend save
    // below is the actual source of truth.
    const localUser = user;
    if (localUser) {
      await setDoc(doc(db, "users", localUser.uid), {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        email: profileData.email,
        bio: profileData.bio,
        phone: profileData.phoneNumber,
        location: profileData.location,
        website: profileData.website,
        linkedinUrl: profileData.linkedinUrl,
        githubUrl: profileData.githubUrl,
      }, { merge: true });
    }

    const fullName = `${profileData.firstName} ${profileData.lastName}`.trim();
    updateProfileMutation.mutate({
      name: fullName || undefined,
      email: profileData.email || undefined,
      phone: profileData.phoneNumber || undefined,
      bio: profileData.bio || undefined,
      location: profileData.location || undefined,
      website: profileData.website || undefined,
      linkedinUrl: profileData.linkedinUrl || undefined,
      githubUrl: profileData.githubUrl || undefined,
    });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setCropModalOpen(true);
    }
  };

  const handleCropSave = async () => {
    if (!selectedImage || !croppedAreaPixels) return;
    const croppedBlob = await getCroppedImg(URL.createObjectURL(selectedImage), croppedAreaPixels);
    if (!user) return;
    const storageRef = ref(storage, `profile-pictures/${user.uid}/${selectedImage.name}`);
    await uploadBytes(storageRef, croppedBlob);
    const url = await getDownloadURL(storageRef);
    setProfilePic(url);
    await setDoc(doc(db, "users", user.uid), { photoURL: url }, { merge: true });
    toast({ title: "Profile Picture Updated", description: "Your profile picture has been successfully updated." });
    setCropModalOpen(false);
    setSelectedImage(null);
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = event.target.files?.[0];
    if (file) {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "users", user.uid), { resumeUrl: url }, { merge: true });
      toast({ title: "Resume Uploaded", description: "Your resume has been uploaded." });
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage your account settings and personal information
          </p>
        </div>
        <EmailVerificationBanner />
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Profile Completion</span>
            <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            {Object.entries(fields).map(([key, filled]) => (
              <span key={key} className={`px-2 py-1 rounded ${filled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{key}</span>
            ))}
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Profile Picture Section */}
                <div className="flex items-center gap-6">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profilePic} alt="Profile" />
                    <AvatarFallback className="text-lg">
                      {getInitials(profileData.firstName, profileData.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="dark:border-gray-600 dark:text-gray-300">
                        {backendUser?.authProvider || "local"}
                      </Badge>
                      {backendUser?.isEmailVerified ? (
                        <Badge variant="secondary" className="dark:bg-green-900/20 dark:text-green-400">
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                          Email not verified
                        </Badge>
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="profile-upload"
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => document.getElementById("profile-upload")?.click()}
                        className="dark:border-gray-600 dark:text-gray-300"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Change Photo
                      </Button>
                    </div>
                  </div>
                </div>
                <Dialog open={cropModalOpen} onOpenChange={setCropModalOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Crop photo</DialogTitle>
                    </DialogHeader>
                    {selectedImage && (
                      <>
                        <div style={{ position: 'relative', width: '100%', height: 300, background: '#333' }}>
                          <Cropper
                            image={URL.createObjectURL(selectedImage)}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                          />
                        </div>
                        <input
                          type="range"
                          aria-label="Zoom"
                          className="mt-4 w-full"
                          value={zoom}
                          min={1}
                          max={3}
                          step={0.1}
                          onChange={(e) => setZoom(Number(e.target.value))}
                        />
                        <Button onClick={handleCropSave} className="mt-4 w-full">Save</Button>
                      </>
                    )}
                  </DialogContent>
                </Dialog>

                <Separator className="dark:bg-gray-700" />

                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="dark:text-gray-300">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                      disabled={!isEditing}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="dark:text-gray-300">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                      disabled={!isEditing}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="dark:text-gray-300">Email</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={!isEditing}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio" className="dark:text-gray-300">Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us about yourself..."
                    value={profileData.bio}
                    onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                    disabled={!isEditing}
                    rows={3}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="dark:text-gray-300">Phone Number</Label>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <Input
                        id="phone"
                        value={profileData.phoneNumber}
                        onChange={(e) => setProfileData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                        disabled={!isEditing}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location" className="dark:text-gray-300">Location</Label>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <Input
                        id="location"
                        value={profileData.location}
                        onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                        disabled={!isEditing}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Social Links */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium dark:text-gray-100">Social Links</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="website" className="dark:text-gray-300">Website</Label>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Input
                          id="website"
                          value={profileData.website}
                          onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                          disabled={!isEditing}
                          placeholder="https://yourwebsite.com"
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin" className="dark:text-gray-300">LinkedIn</Label>
                      <div className="flex items-center gap-2">
                        <Linkedin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Input
                          id="linkedin"
                          value={profileData.linkedinUrl}
                          onChange={(e) => setProfileData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                          disabled={!isEditing}
                          placeholder="https://linkedin.com/in/yourprofile"
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="github" className="dark:text-gray-300">GitHub</Label>
                      <div className="flex items-center gap-2">
                        <Github className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Input
                          id="github"
                          value={profileData.githubUrl}
                          onChange={(e) => setProfileData(prev => ({ ...prev, githubUrl: e.target.value }))}
                          disabled={!isEditing}
                          placeholder="https://github.com/yourusername"
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    {/* "Connect LinkedIn" (OAuth popup) was removed: the backend handler was unsafe and is
                        disabled (see gateway AuthController). Enter your LinkedIn URL above instead. */}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-6">
                  {isEditing ? (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsEditing(false)}
                        className="dark:border-gray-600 dark:text-gray-300"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      Edit Profile
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Settings className="h-5 w-5" />
                  Account Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Email Notifications</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Receive email updates about your job applications
                      </p>
                    </div>
                    <Switch
                      checked={settings.emailUpdates}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, emailUpdates: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Push Notifications</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Receive push notifications for important updates
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifications}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, notifications: checked }))
                      }
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-700" />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium dark:text-gray-100">Account Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="dark:text-gray-300">Account Created</Label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {/* user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown" */}
                        {/* This part needs to be updated to fetch from Firestore */}
                        {profileLoading ? "Loading..." : "N/A"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="dark:text-gray-300">Last Login</Label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {/* user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Unknown" */}
                        {/* This part needs to be updated to fetch from Firestore */}
                        {profileLoading ? "Loading..." : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <Button 
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Eye className="h-5 w-5" />
                  Privacy Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Public Profile</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Make your profile visible to other users
                      </p>
                    </div>
                    <Switch
                      checked={settings.privacy.profileVisible}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ 
                          ...prev, 
                          privacy: { ...prev.privacy, profileVisible: checked }
                        }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Show Email</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Display your email address on your profile
                      </p>
                    </div>
                    <Switch
                      checked={settings.privacy.emailVisible}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ 
                          ...prev, 
                          privacy: { ...prev.privacy, emailVisible: checked }
                        }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Show Phone</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Display your phone number on your profile
                      </p>
                    </div>
                    <Switch
                      checked={settings.privacy.phoneVisible}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ 
                          ...prev, 
                          privacy: { ...prev.privacy, phoneVisible: checked }
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <Button 
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Privacy Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-gray-100">
                  <Shield className="h-5 w-5" />
                  Security Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="dark:text-gray-300">Two-Factor Authentication</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Switch
                      checked={settings.twoFactorEnabled}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, twoFactorEnabled: checked }))
                      }
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-700" />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium dark:text-gray-100">Connected Accounts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-600">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                          <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium dark:text-gray-100">Local Account</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Connected via Local Auth</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="dark:bg-green-900/20 dark:text-green-400">
                        Connected
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium dark:text-gray-100">Security Actions</h3>
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full dark:border-gray-600 dark:text-gray-300">
                      <Lock className="h-4 w-4 mr-2" />
                      Change Password
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full dark:border-gray-600 dark:text-gray-300"
                      onClick={() => exportDataMutation.mutate()}
                      disabled={exportDataMutation.isPending}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportDataMutation.isPending ? "Preparing export..." : "Download Account Data"}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Security Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="mt-6 border-red-200 dark:border-red-900/50 dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 rounded-lg border border-red-200 p-4 dark:border-red-900/50 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Delete my account</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Permanently deletes your profile, resumes, and saved jobs. This cannot be undone.
                    </p>
                  </div>
                  <AlertDialog
                    onOpenChange={(open) => {
                      if (!open) setDeleteConfirmText("");
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="shrink-0">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete My Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              This deletes your JobGenie profile, best-effort removes your uploaded
                              resumes and saved jobs, and revokes your sign-in. This action cannot be
                              undone.
                            </p>
                            <div className="space-y-1">
                              <Label htmlFor="delete-confirm" className="text-foreground">
                                Type <span className="font-semibold">DELETE</span> to confirm
                              </Label>
                              <Input
                                id="delete-confirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                autoComplete="off"
                              />
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deleteConfirmText !== "DELETE" || deleteAccountMutation.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            deleteAccountMutation.mutate();
                          }}
                          className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
                        >
                          {deleteAccountMutation.isPending ? "Deleting..." : "Yes, delete my account"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <div className="mt-6">
          <Label htmlFor="resume-upload" className="dark:text-gray-300">Resume</Label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleResumeUpload}
            className="border rounded px-3 py-2"
            id="resume-upload"
          />
          <span className="text-xs text-gray-500">Upload your resume (PDF, DOC, DOCX)</span>
        </div>
      </div>
    </div>
  );
}