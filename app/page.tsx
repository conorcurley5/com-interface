"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

import data from "./data.json"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { AudioLines, ChevronsLeft, ChevronsRight, Home, Plus, PowerOff, ZapOff } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { NumberKeypadInput } from "@/components/number_keypad_input"
import { useState } from "react"

export default function Page() {
  const [quantity, setQuantity] = useState("")

  return (
    <SidebarProvider
    defaultOpen={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset"  />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2 h-full">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 h-full">
              <Tabs defaultValue="jog" className="h-full mx-6" >
                <TabsList >
                  <TabsTrigger value="jog">Jog</TabsTrigger>
                  <TabsTrigger value="goto">Go To</TabsTrigger>
                  <TabsTrigger value="control">Control</TabsTrigger>
                </TabsList>
                <TabsContent value="jog">
                  <Card className="h-full">
                      <CardHeader>
                          <CardTitle>Jog</CardTitle>
                          <CardDescription>Jog the motor in a selected direction at a given velocity.</CardDescription>
                      </CardHeader>
                      <CardFooter className="flex-col items-center justify-center gap-1.5 text-sm flex-grow-1">
                        <ButtonGroup className="[--radius:9999rem] w-full">
                          <ButtonGroup>
                            <Button variant="outline" size="icon">
                              <ChevronsLeft />
                            </Button>
                          </ButtonGroup>

                          <ButtonGroup className="grow-1">
                            <InputGroup>
                              <NumberKeypadInput
                                  label="Speed (RPM)"
                                  value={quantity}
                                  onChange={setQuantity}
                                  placeholder="0"
                                  allowDecimal={false}
                                />

                            </InputGroup>
                          </ButtonGroup>

                          <ButtonGroup>
                            <Button variant="outline" size="icon">
                              <ChevronsRight />
                            </Button>
                          </ButtonGroup>
                        </ButtonGroup>
                      </CardFooter>
                  </Card>
                </TabsContent>
                <TabsContent value="goto">
                  <Card>
                      <CardHeader>
                          <CardTitle>Go To</CardTitle>
                          <CardDescription>Move the motor to a specific position.</CardDescription>
                      </CardHeader>
                      <CardFooter className="flex-col items-center justify-center gap-1.5 text-sm">
                        <ButtonGroup className="[--radius:9999rem]">
                          <ButtonGroup>
                            <Button variant="outline">
                              <Home className="text-primary" /> Home
                            </Button>
                          </ButtonGroup>

                          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-8" />

                          <ButtonGroup>
                            <InputGroup>
                              <InputGroupInput
                                placeholder={
                                  "Position"
                                }
                              />
                            </InputGroup>
                          </ButtonGroup>

                          <ButtonGroup>
                            <Button variant="outline">
                              <ChevronsRight className="text-green-600" /> Go To
                            </Button>
                          </ButtonGroup>
                        </ButtonGroup>
                      </CardFooter>
                  </Card>
                </TabsContent>
                <TabsContent value="control">
                  <Card>
                      <CardHeader>
                          <CardTitle>Control</CardTitle>
                          <CardDescription>De-energize or shut down the motor system.</CardDescription>
                      </CardHeader>
                      <CardFooter className="flex-row items-center justify-between gap-1.5 text-sm">
                        {/* <ButtonGroup className="[--radius:9999rem]"> */}
                          <ButtonGroup>
                            <Button variant="outline">
                              <ZapOff className="text-destructive" /> De-Energize
                            </Button>
                          </ButtonGroup>

                          <ButtonGroup>
                            <Button variant="destructive">
                              <PowerOff className="text-destructive" /> Shut Down
                            </Button>
                          </ButtonGroup>
                        {/* </ButtonGroup> */}
                      </CardFooter>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <DataTable data={data} /> */}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
